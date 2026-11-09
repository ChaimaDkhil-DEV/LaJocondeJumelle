import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { temporaryPassword } from '../users/users.service';
import type { ActionContext } from './parent-communications.service';
import type {
  GuardianAccountDto,
  GuardianDto,
  TeacherClassesDto,
  UpdateGuardianDto,
} from './parent-communications.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GUARDIAN_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  relationship: true,
  phone: true,
  email: true,
  active: true,
  user: { select: { id: true, username: true, active: true } },
  students: {
    select: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          active: true,
          class: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { student: { lastName: 'asc' } },
  },
} satisfies Prisma.GuardianSelect;

type GuardianRow = Prisma.GuardianGetPayload<{ select: typeof GUARDIAN_SELECT }>;

function toGuardian({ user, students, ...g }: GuardianRow) {
  return { ...g, account: user, students: students.map((s) => s.student) };
}

/**
 * Données de la communication avec les parents gérées par l'administration (015, FR-012) :
 * représentants légaux, leurs élèves et leur compte parent, classes attribuées aux enseignants.
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list() {
    const rows = await this.prisma.guardian.findMany({
      select: GUARDIAN_SELECT,
      orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(toGuardian);
  }

  private async assertStudents(studentIds: string[]): Promise<void> {
    if (studentIds.length === 0) return;
    const found = await this.prisma.student.count({
      where: { id: { in: studentIds }, active: true },
    });
    if (found !== studentIds.length) throw new AppException('GUARDIAN_STUDENT_INVALID');
  }

  async create(dto: GuardianDto, ctx: ActionContext) {
    await this.assertStudents(dto.studentIds);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guardian.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          relationship: dto.relationship ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          students: { create: dto.studentIds.map((studentId) => ({ studentId })) },
        },
        select: GUARDIAN_SELECT,
      });
      await this.audit.log(
        'GUARDIAN_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'Guardian',
          targetId: created.id,
          ip: ctx.ip,
          details: { event: 'CREATED', studentIds: dto.studentIds },
        },
        tx,
      );
      return created;
    });
    return toGuardian(row);
  }

  async update(id: string, dto: UpdateGuardianDto, ctx: ActionContext) {
    const current = UUID.test(id) ? await this.prisma.guardian.findUnique({ where: { id } }) : null;
    if (!current) throw new AppException('NOT_FOUND');
    if (dto.studentIds) await this.assertStudents(dto.studentIds);
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.studentIds) {
        await tx.guardianStudent.deleteMany({
          where: { guardianId: id, studentId: { notIn: dto.studentIds } },
        });
        await tx.guardianStudent.createMany({
          data: dto.studentIds.map((studentId) => ({ guardianId: id, studentId })),
          skipDuplicates: true,
        });
      }
      const updated = await tx.guardian.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.relationship !== undefined ? { relationship: dto.relationship } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: GUARDIAN_SELECT,
      });
      // Représentant désactivé : son compte parent l'est aussi (plus aucun accès aux messages).
      if (dto.active === false && current.userId) {
        await tx.user.update({ where: { id: current.userId }, data: { active: false } });
        await tx.session.deleteMany({ where: { userId: current.userId } });
      }
      await this.audit.log(
        'GUARDIAN_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'Guardian',
          targetId: id,
          ip: ctx.ip,
          details: { event: 'UPDATED', fields: Object.keys(dto) },
        },
        tx,
      );
      return updated;
    });
    return toGuardian(row);
  }

  /** Crée le compte parent du représentant ; le mot de passe provisoire n'est renvoyé qu'ici, une seule fois. */
  async createAccount(id: string, dto: GuardianAccountDto, ctx: ActionContext) {
    const guardian = UUID.test(id)
      ? await this.prisma.guardian.findUnique({ where: { id } })
      : null;
    if (!guardian || !guardian.active) throw new AppException('NOT_FOUND');
    if (guardian.userId)
      throw new AppException('CONFLICT', undefined, 'Ce représentant a déjà un compte parent.');
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new AppException(
        'CONFLICT',
        { fields: [{ field: 'username', messages: ['Cet identifiant est déjà utilisé.'] }] },
        'Cet identifiant est déjà utilisé.',
      );
    }
    const password = temporaryPassword();
    const passwordHash = await this.auth.hashPassword(password);
    const row = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          displayName: `${guardian.firstName} ${guardian.lastName}`,
          role: 'PARENT',
          passwordHash,
          mustChangePassword: true,
        },
      });
      const updated = await tx.guardian.update({
        where: { id },
        data: { userId: user.id },
        select: GUARDIAN_SELECT,
      });
      await this.audit.log(
        'USER_CREATED',
        {
          actorId: ctx.actor.id,
          targetType: 'User',
          targetId: user.id,
          ip: ctx.ip,
          details: { username: user.username, role: 'PARENT', guardianId: id },
        },
        tx,
      );
      await this.audit.log(
        'GUARDIAN_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'Guardian',
          targetId: id,
          ip: ctx.ip,
          details: { event: 'ACCOUNT_CREATED' },
        },
        tx,
      );
      return updated;
    });
    return { guardian: toGuardian(row), temporaryPassword: password };
  }

  // ------------------------------------------------------------------ Classes des enseignants

  /** Membres actifs du groupe Enseignants et leurs classes attribuées. */
  async teacherClasses() {
    const teachers = await this.prisma.user.findMany({
      where: {
        active: true,
        role: { not: 'PARENT' },
        groupMemberships: { some: { group: { systemKey: 'TEACHERS', active: true } } },
      },
      select: {
        id: true,
        displayName: true,
        teacherClasses: { select: { classId: true }, orderBy: { classId: 'asc' } },
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
    return teachers.map(({ teacherClasses, ...teacher }) => ({
      teacher,
      classIds: teacherClasses.map((c) => c.classId),
    }));
  }

  async setTeacherClasses(teacherId: string, dto: TeacherClassesDto, ctx: ActionContext) {
    const teacher = UUID.test(teacherId)
      ? await this.prisma.user.findFirst({
          where: {
            id: teacherId,
            active: true,
            role: { not: 'PARENT' },
            groupMemberships: { some: { group: { systemKey: 'TEACHERS', active: true } } },
          },
          select: { id: true },
        })
      : null;
    if (!teacher) throw new AppException('TEACHER_REQUIRED');
    const classes = await this.prisma.schoolClass.count({
      where: { id: { in: dto.classIds }, active: true },
    });
    if (classes !== dto.classIds.length) throw new AppException('CLASS_INACTIVE');
    await this.prisma.$transaction(async (tx) => {
      await tx.teacherClass.deleteMany({ where: { teacherId, classId: { notIn: dto.classIds } } });
      await tx.teacherClass.createMany({
        data: dto.classIds.map((classId) => ({ teacherId, classId })),
        skipDuplicates: true,
      });
      await this.audit.log(
        'TEACHER_CLASSES_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'User',
          targetId: teacherId,
          ip: ctx.ip,
          details: { classIds: dto.classIds },
        },
        tx,
      );
    });
    return { teacherId, classIds: [...dto.classIds].sort() };
  }
}
