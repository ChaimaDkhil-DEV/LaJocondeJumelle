import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { atLocalTime, localDate } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { RealtimeService } from '../realtime/realtime.service';
import type { RequestContext } from '../requests/requests.service';
import type { ManualDepartureDto } from './attendance.dto';
import { dayValue } from './attendance.mapper';
import { AttendanceGate } from './attendance-gate.service';
import { presenceOf, type ArrivalFact, type Presence, type PresenceClass, type PresenceState } from './domain/presence';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON = { select: { id: true, displayName: true } } as const;
const CLASS = { select: { id: true, name: true, room: true } } as const;

const DEPARTURE_INCLUDE = { class: CLASS, recordedBy: PERSON } as const satisfies Prisma.TeacherDepartureInclude;
type DepartureRow = Prisma.TeacherDepartureGetPayload<{ include: typeof DEPARTURE_INCLUDE }>;
type Db = PrismaService | Prisma.TransactionClient;

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

/** Ce que l'enseignant voit de sa propre présence après un scan. */
export interface OwnPresence {
  state: PresenceState;
  firstArrivalAt: Date | null;
  /** Heure du départ en cours ; null s'il est présent ou pas arrivé. */
  departedAt: Date | null;
}

export interface PresenceResult {
  /** Vrai si ce scan a changé quelque chose ; faux s'il rappelle un état déjà enregistré. */
  created: boolean;
  presence: OwnPresence;
}

interface Person {
  id: string;
  displayName: string;
}

export interface PresentTeacher {
  teacher: Person;
  firstArrivalAt: Date | null;
  lastClass: PresenceClass;
  lastSeenAt: Date;
}

export interface DepartedTeacher extends PresentTeacher {
  departure: {
    id: string;
    departedAt: Date;
    method: 'QR' | 'MANUAL';
    class: PresenceClass | null;
    recordedBy: Person;
    comment: string | null;
  };
}

export interface PresentList {
  /** Jour dans le fuseau de l'école (AAAA-MM-JJ). */
  date: string;
  present: PresentTeacher[];
  departed: DepartedTeacher[];
}

/**
 * Enseignants présents dans l'établissement (019). Une personne présente est une personne arrivée
 * aujourd'hui (au moins un pointage qui n'est pas « absent ») et sans départ en cours. Le départ et le
 * retour passent, comme l'arrivée, par le scan du QR d'une classe : la session identifie l'enseignant,
 * l'heure est celle du serveur. L'administration peut saisir l'un et l'autre, avec trace au journal d'audit.
 */
@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: AttendanceGate,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Enseignant (scan du QR)
  // ---------------------------------------------------------------------------

  /** Où en est l'enseignant aujourd'hui : sert à la page du QR pour proposer l'arrivée, le départ ou le retour. */
  async own(teacherId: string, day = this.today(), db: Db = this.prisma): Promise<OwnPresence> {
    return this.ownView(await this.load(db, day, teacherId));
  }

  /**
   * Départ par second scan. Refusé sans arrivée ce jour. Idempotent : un deuxième scan, y compris
   * simultané (index unique partiel), rappelle le départ en cours sans en créer un autre.
   */
  async depart(user: AuthenticatedUser, token: string, ctx: RequestContext): Promise<PresenceResult> {
    await this.gate.assertTeacher(user, ctx);
    const schoolClass = await this.gate.classFromToken(token);
    const now = new Date();
    const day = this.today(now);
    const current = await this.load(this.prisma, day, user.id);
    if (current.state === 'NOT_ARRIVED') throw new AppException('ATTENDANCE_NOT_PRESENT');
    if (current.state === 'DEPARTED') return { created: false, presence: this.ownView(current) };

    try {
      await this.prisma.teacherDeparture.create({
        data: { teacherId: user.id, localDate: dayValue(day), departedAt: now, method: 'QR', classId: schoolClass.id, recordedAt: now, recordedById: user.id },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      return { created: false, presence: await this.own(user.id, day) };
    }
    await this.notifyChange(user.id, day);
    return { created: true, presence: await this.own(user.id, day) };
  }

  /** Retour après un départ, par un nouveau scan. Sans départ en cours, rien ne change. */
  async comeBack(user: AuthenticatedUser, token: string, ctx: RequestContext): Promise<PresenceResult> {
    await this.gate.assertTeacher(user, ctx);
    await this.gate.classFromToken(token);
    const now = new Date();
    const day = this.today(now);
    const closed = await this.closeOpenDeparture(this.prisma, user.id, day, now, user.id);
    if (closed) await this.notifyChange(user.id, day);
    return { created: closed, presence: await this.own(user.id, day) };
  }

  /**
   * Clôt le départ en cours de l'enseignant, s'il y en a un. Appelé aussi par l'arrivée dans une autre
   * classe (dans sa transaction) : scanner une nouvelle classe après être parti vaut retour.
   */
  async closeOpenDeparture(db: Db, teacherId: string, day: string, at: Date, byId: string): Promise<boolean> {
    const { count } = await db.teacherDeparture.updateMany({
      where: { teacherId, localDate: dayValue(day), returnedAt: null },
      data: { returnedAt: at, returnedById: byId },
    });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Administration
  // ---------------------------------------------------------------------------

  /** Qui est dans l'établissement maintenant, et qui en est reparti aujourd'hui : une ligne par enseignant. */
  async list(user: AuthenticatedUser, ctx: RequestContext): Promise<PresentList> {
    await this.gate.assertManager(user, ctx);
    const day = this.today();
    const [attendances, departures] = await Promise.all([
      this.prisma.teacherAttendance.findMany({
        where: { localDate: dayValue(day), status: { not: 'ABSENT' } },
        select: { teacherId: true, status: true, arrivedAt: true, recordedAt: true, class: CLASS, teacher: PERSON },
      }),
      this.prisma.teacherDeparture.findMany({ where: { localDate: dayValue(day), returnedAt: null }, include: DEPARTURE_INCLUDE }),
    ]);

    const byTeacher = new Map<string, { teacher: Person; arrivals: ArrivalFact[] }>();
    for (const row of attendances) {
      if (!byTeacher.has(row.teacherId)) byTeacher.set(row.teacherId, { teacher: row.teacher, arrivals: [] });
      byTeacher.get(row.teacherId)!.arrivals.push(row);
    }

    const present: PresentTeacher[] = [];
    const departed: DepartedTeacher[] = [];
    for (const [teacherId, { teacher, arrivals }] of byTeacher) {
      const p = presenceOf(arrivals, departures.filter((d) => d.teacherId === teacherId));
      if (!p.lastClass || !p.lastSeenAt) continue;
      const line: PresentTeacher = { teacher, firstArrivalAt: p.firstArrivalAt, lastClass: p.lastClass, lastSeenAt: p.lastSeenAt };
      if (p.openDeparture) departed.push({ ...line, departure: this.departureView(p.openDeparture) });
      else present.push(line);
    }
    const byName = (a: PresentTeacher, b: PresentTeacher) => a.teacher.displayName.localeCompare(b.teacher.displayName, 'fr');
    return { date: day, present: present.sort(byName), departed: departed.sort(byName) };
  }

  /** Départ saisi par l'administration pour un enseignant présent qui est parti sans scanner. Aujourd'hui seulement. */
  async recordDeparture(user: AuthenticatedUser, dto: ManualDepartureDto, ctx: RequestContext): Promise<DepartedTeacher['departure']> {
    await this.gate.assertManager(user, ctx);
    const now = new Date();
    const day = this.today(now);
    const current = await this.load(this.prisma, day, dto.teacherId);
    if (current.state === 'NOT_ARRIVED') throw new AppException('ATTENDANCE_NOT_PRESENT');
    if (current.state === 'DEPARTED') throw new AppException('DEPARTURE_EXISTS');

    const departedAt = dto.departedTime ? atLocalTime(day, dto.departedTime, this.config.schoolTimezone) : now;
    if (departedAt > now) throw fieldError('departedTime', 'L’heure de départ ne peut pas être dans le futur.');
    if (current.firstArrivalAt && departedAt < current.firstArrivalAt) {
      throw fieldError('departedTime', 'L’heure de départ ne peut pas précéder l’heure d’arrivée.');
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.teacherDeparture.create({
          data: {
            teacherId: dto.teacherId,
            localDate: dayValue(day),
            departedAt,
            method: 'MANUAL',
            recordedAt: now,
            recordedById: user.id,
            comment: dto.comment ?? null,
          },
          include: DEPARTURE_INCLUDE,
        });
        await this.audit.log(
          'ATTENDANCE_MANUAL',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'TeacherDeparture',
            targetId: created.id,
            details: { action: 'DEPARTURE', teacherId: dto.teacherId, method: 'MANUAL', departedAt: departedAt.toISOString() },
          },
          tx,
        );
        return created;
      });
      await this.notifyChange(dto.teacherId, day);
      return this.departureView(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppException('DEPARTURE_EXISTS');
      throw error;
    }
  }

  /** L'administration constate qu'un enseignant noté parti est de retour (ou n'était pas parti) : le départ est clos, pas supprimé. */
  async markReturned(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<{ id: string; returnedAt: Date }> {
    await this.gate.assertManager(user, ctx);
    const row = UUID.test(id) ? await this.prisma.teacherDeparture.findUnique({ where: { id } }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    const now = new Date();
    const done = await this.prisma.$transaction(async (tx) => {
      // Conditionnelle : un retour scanné au même instant par l'enseignant n'est pas écrasé.
      const { count } = await tx.teacherDeparture.updateMany({ where: { id, returnedAt: null }, data: { returnedAt: now, returnedById: user.id } });
      if (count === 0) return false;
      await this.audit.log(
        'ATTENDANCE_CORRECTED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TeacherDeparture',
          targetId: id,
          details: { action: 'RETURN', teacherId: row.teacherId, method: row.method, departedAt: row.departedAt.toISOString() },
        },
        tx,
      );
      return true;
    });
    if (!done) throw new AppException('DEPARTURE_ALREADY_CLOSED');
    await this.notifyChange(row.teacherId, row.localDate.toISOString().slice(0, 10));
    return { id, returnedAt: now };
  }

  // ---------------------------------------------------------------------------
  // Temps réel
  // ---------------------------------------------------------------------------

  /**
   * `attendance:updated` vers l'administration (comptes Admin et super administrateur actifs, ceux qui
   * voient le suivi) et vers l'enseignant concerné. L'événement ne porte aucune donnée de présence : les
   * écrans relisent par REST, où les droits sont revérifiés.
   */
  async notifyChange(teacherId: string, day: string): Promise<void> {
    const managers = await this.prisma.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
    this.realtime.emitToUsers([...managers.map((m) => m.id), teacherId], 'attendance:updated', { teacherId, date: day });
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  private today(now = new Date()): string {
    return localDate(now, this.config.schoolTimezone);
  }

  private async load(db: Db, day: string, teacherId: string): Promise<Presence<DepartureRow>> {
    const [arrivals, departures] = await Promise.all([
      db.teacherAttendance.findMany({
        where: { teacherId, localDate: dayValue(day) },
        select: { status: true, arrivedAt: true, recordedAt: true, class: CLASS },
      }),
      db.teacherDeparture.findMany({ where: { teacherId, localDate: dayValue(day), returnedAt: null }, include: DEPARTURE_INCLUDE }),
    ]);
    return presenceOf(arrivals, departures);
  }

  private ownView(p: Presence): OwnPresence {
    return { state: p.state, firstArrivalAt: p.firstArrivalAt, departedAt: p.openDeparture?.departedAt ?? null };
  }

  private departureView(row: DepartureRow): DepartedTeacher['departure'] {
    return { id: row.id, departedAt: row.departedAt, method: row.method, class: row.class, recordedBy: row.recordedBy, comment: row.comment };
  }
}
