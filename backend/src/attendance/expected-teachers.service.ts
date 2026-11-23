import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import { addDays, atLocalTime, localDate, localTime } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import { dayValue } from './attendance.mapper';
import { AttendanceGate } from './attendance-gate.service';
import type { ExpectedQuery } from './attendance.dto';
import {
  sessionStatus,
  type SessionStatus,
  type SessionStatusResult,
  type StatusAnnounced,
  type StatusArrival,
  type StatusDeparture,
} from './domain/session-status';

interface Person {
  id: string;
  displayName: string;
}

/** Une ligne de la liste : une séance et l'enseignant attendu (deux lignes quand un remplaçant est désigné, R6). */
export interface ExpectedLine extends SessionStatusResult {
  sessionId: string;
  role: 'TEACHER' | 'TITULAR' | 'SUBSTITUTE';
  teacher: Person;
  replaces: Person | null;
  replacedBy: Person | null;
  class: { id: string; name: string; room: string | null };
  level: { id: string; name: string } | null;
  subject: string | null;
  room: string | null;
  date: string;
  startAt: Date;
  endAt: Date;
  startTime: string;
  endTime: string;
  cancelReason: string | null;
}

/** Présence d'une séance dans l'emploi du temps d'administration : l'enseignant prévu, et son remplaçant s'il y en a un. */
export interface SessionPresence {
  status: SessionStatus;
  /** Heure réelle du pointage de l'enseignant prévu ; null sans pointage. */
  arrivedAt: Date | null;
  lateMinutes: number | null;
  lateReason: SessionStatusResult['lateReason'];
  requestId: string | null;
  /** Remplaçant désigné sur une absence annoncée ; l'enseignant prévu (titulaire) reste celui de la séance. */
  replacedBy: Person | null;
  /** Le remplaçant, évalué sur ses propres pointages. */
  substitute: { teacher: Person; status: SessionStatus; arrivedAt: Date | null; lateMinutes: number | null } | null;
}

export interface ExpectedDay {
  date: string;
  serverNow: Date;
  settings: { lateThresholdMinutes: number; toleranceMinutes: number };
  counts: { expected: number; present: number; late: number; notArrived: number };
  lines: ExpectedLine[];
}

interface Announcement extends StatusAnnounced {
  teacherId: string | null;
  substitute: Person | null;
}

const NOT_EXPECTED: readonly SessionStatus[] = ['CANCELLED', 'EXCUSED'];

/**
 * Enseignants attendus (020) : pour chaque séance du jour, l'enseignant attendu et un statut calculé à la lecture
 * à partir des faits déjà enregistrés par le pointage. Rien n'est écrit : aucune absence n'est déduite d'un défaut
 * de scan, « Non arrivé » est un constat affiché.
 */
@Injectable()
export class ExpectedTeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: AttendanceGate,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async day(user: AuthenticatedUser, query: ExpectedQuery, ctx: RequestContext): Promise<ExpectedDay> {
    await this.gate.assertManager(user, ctx);
    const now = new Date();
    const date = query.date ?? localDate(now, this.config.schoolTimezone);
    const rules = await this.rules();
    const lines = await this.linesFor(date, now, rules, query.classId);

    const scoped = lines
      .filter((l) => !query.teacherId || l.teacher.id === query.teacherId)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.teacher.displayName.localeCompare(b.teacher.displayName, 'fr'));
    // Les compteurs suivent la date, l'enseignant et la classe, jamais le filtre de statut.
    const counts = {
      expected: scoped.filter((l) => !NOT_EXPECTED.includes(l.status)).length,
      present: scoped.filter((l) => l.status === 'PRESENT').length,
      late: scoped.filter((l) => l.status === 'LATE').length,
      notArrived: scoped.filter((l) => l.status === 'NOT_ARRIVED').length,
    };
    return {
      date,
      serverNow: now,
      settings: rules,
      counts,
      lines: query.status ? scoped.filter((l) => l.status === query.status) : scoped,
    };
  }

  /**
   * Présence de chaque séance non annulée des jours donnés, pour l'emploi du temps d'administration : le même calcul
   * que la liste des attendus (rien n'est écrit, aucune règle n'est modifiée), regroupé par séance. Le droit d'accès
   * est vérifié par l'appelant.
   */
  async presenceBySession(dates: readonly string[], classId?: string): Promise<Map<string, SessionPresence>> {
    const now = new Date();
    const rules = await this.rules();
    const bySession = new Map<string, SessionPresence>();
    for (const date of dates) {
      for (const line of await this.linesFor(date, now, rules, classId)) {
        const entry = bySession.get(line.sessionId) ?? {
          status: line.status,
          arrivedAt: null,
          lateMinutes: null,
          lateReason: null,
          requestId: null,
          replacedBy: null,
          substitute: null,
        };
        if (line.role === 'SUBSTITUTE') {
          entry.substitute = { teacher: line.teacher, status: line.status, arrivedAt: line.arrivedAt, lateMinutes: line.lateMinutes };
        } else {
          Object.assign(entry, { status: line.status, arrivedAt: line.arrivedAt, lateMinutes: line.lateMinutes, lateReason: line.lateReason, requestId: line.requestId, replacedBy: line.replacedBy });
        }
        bySession.set(line.sessionId, entry);
      }
    }
    return bySession;
  }

  private async rules() {
    const [lateThresholdMinutes, toleranceMinutes] = await Promise.all([
      this.settings.get('attendanceLateThresholdMinutes'),
      this.settings.get('attendanceToleranceMinutes'),
    ]);
    return { lateThresholdMinutes, toleranceMinutes };
  }

  /** Les lignes d'un jour : une par séance et enseignant attendu (deux quand un remplaçant est désigné, R6). */
  private async linesFor(date: string, now: Date, rules: { lateThresholdMinutes: number; toleranceMinutes: number }, classId?: string): Promise<ExpectedLine[]> {
    const tz = this.config.schoolTimezone;
    const from = atLocalTime(date, '00:00', tz);
    const to = atLocalTime(addDays(date, 1), '00:00', tz);

    const sessions = await this.prisma.teachingSession.findMany({
      where: { localDate: dayValue(date), ...(classId ? { classId } : {}) },
      include: {
        teacher: { select: { id: true, displayName: true } },
        class: { select: { id: true, name: true, room: true, level: { select: { id: true, name: true } } } },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    const requests = await this.prisma.coverageDetail.findMany({
      where: {
        source: 'TEACHER_REQUEST',
        type: { in: ['LATENESS', 'ABSENCE'] },
        mergedIntoId: null,
        startAt: { lt: to },
        OR: [{ plannedEndAt: null }, { plannedEndAt: { gt: from } }],
        request: { status: { not: 'CANCELLED' } },
      },
      select: { requestId: true, type: true, teacherId: true, startAt: true, plannedEndAt: true, substituteTeacher: { select: { id: true, displayName: true } } },
    });
    const announced: Announcement[] = requests.map((r) => ({
      requestId: r.requestId,
      type: r.type as 'LATENESS' | 'ABSENCE',
      startAt: r.startAt,
      plannedEndAt: r.plannedEndAt,
      teacherId: r.teacherId,
      substitute: r.substituteTeacher,
    }));
    const teacherIds = [...new Set([...sessions.map((s) => s.teacherId), ...announced.flatMap((a) => (a.substitute ? [a.substitute.id] : []))])];
    const [arrivals, departures, empties] = await Promise.all([
      this.prisma.teacherAttendance.findMany({
        where: { localDate: dayValue(date), teacherId: { in: teacherIds } },
        select: { teacherId: true, status: true, arrivedAt: true, recordedAt: true, classId: true },
      }),
      this.prisma.teacherDeparture.findMany({
        where: { localDate: dayValue(date), teacherId: { in: teacherIds } },
        select: { teacherId: true, departedAt: true, returnedAt: true },
      }),
      this.prisma.coverageDetail.findMany({
        where: { type: 'EMPTY_CLASS', mergedIntoId: null, startAt: { gte: from, lt: to }, classId: { in: [...new Set(sessions.map((s) => s.classId))] }, request: { status: { not: 'CANCELLED' } } },
        select: { classId: true, startAt: true },
      }),
    ]);

    const arrivalsOf = (teacherId: string): StatusArrival[] => arrivals.filter((a) => a.teacherId === teacherId);
    const departuresOf = (teacherId: string): StatusDeparture[] => departures.filter((d) => d.teacherId === teacherId);
    const announcedOf = (teacherId: string) => announced.filter((a) => a.teacherId === teacherId);

    const lines: ExpectedLine[] = sessions.flatMap((s): ExpectedLine[] => {
      const base = {
        sessionId: s.id,
        class: { id: s.class.id, name: s.class.name, room: s.class.room },
        level: s.class.level,
        subject: s.subject,
        room: s.room ?? s.class.room,
        date,
        startAt: s.startAt,
        endAt: s.endAt,
        startTime: localTime(s.startAt, tz),
        endTime: localTime(s.endAt, tz),
        cancelReason: s.cancelReason,
      };
      const evaluate = (teacherId: string) =>
        sessionStatus(
          { startAt: s.startAt, endAt: s.endAt, classId: s.classId, cancelled: s.status === 'CANCELLED' },
          {
            arrivals: arrivalsOf(teacherId),
            departures: departuresOf(teacherId),
            announced: announcedOf(teacherId),
            emptyClassAt: empties.filter((e) => e.classId === s.classId).map((e) => e.startAt),
          },
          now,
          rules,
        );
      // Remplaçant désigné sur une absence annoncée qui couvre la séance : il est attendu, le titulaire est excusé.
      const replaced =
        s.status === 'SCHEDULED'
          ? announcedOf(s.teacherId).find((a) => a.type === 'ABSENCE' && a.substitute && a.startAt < s.endAt && (a.plannedEndAt === null || a.plannedEndAt > s.startAt))
          : undefined;
      if (replaced?.substitute) {
        return [
          { ...base, ...evaluate(s.teacherId), role: 'TITULAR' as const, teacher: s.teacher, replaces: null, replacedBy: replaced.substitute },
          { ...base, ...evaluate(replaced.substitute.id), role: 'SUBSTITUTE' as const, teacher: replaced.substitute, replaces: s.teacher, replacedBy: null },
        ];
      }
      return [{ ...base, ...evaluate(s.teacherId), role: 'TEACHER' as const, teacher: s.teacher, replaces: null, replacedBy: null }];
    });
    return lines;
  }
}
