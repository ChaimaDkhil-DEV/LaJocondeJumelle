import { Injectable } from '@nestjs/common';
import type { Student } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { StudentDto } from './students.dto';

export interface StudentsContext {
  actor: AuthenticatedUser;
  ip: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  parentPhone: true,
  mealService: true,
  active: true,
  class: { select: { id: true, name: true, level: { select: { id: true, name: true, position: true } } } },
} as const;

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

/** Champs modifiés, sans leurs valeurs : le journal ne garde aucune donnée personnelle d'élève. */
function changedFields(before: Student, after: StudentDto): string[] {
  const keys = ['firstName', 'lastName', 'classId', 'parentPhone', 'mealService', 'active'] as const;
  return keys.filter((key) => after[key] !== undefined && after[key] !== before[key]);
}

/**
 * Niveaux, classes et élèves (super administrateur). Le service de restauration est une valeur
 * unique (CANTINE ou PANIER) : la base, le DTO et le formulaire n'en admettent qu'une.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Niveaux par position, avec leurs classes et le nombre d'élèves actifs de chacune. */
  async levels() {
    const levels = await this.prisma.gradeLevel.findMany({
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        cycle: true,
        position: true,
        classes: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            room: true,
            floor: { select: { id: true, name: true } },
            _count: { select: { students: { where: { active: true } } } },
          },
        },
      },
    });
    return levels.map(({ classes, ...level }) => ({
      ...level,
      classes: classes.map(({ _count, ...c }) => ({ ...c, studentCount: _count.students })),
    }));
  }

  /** Tous les élèves (quelques centaines), par niveau, classe puis nom ; l'interface filtre et pagine. */
  async list() {
    const students = await this.prisma.student.findMany({ select: STUDENT_SELECT });
    return students.sort(
      (a, b) =>
        (a.class.level?.position ?? Number.MAX_SAFE_INTEGER) - (b.class.level?.position ?? Number.MAX_SAFE_INTEGER) ||
        a.class.name.localeCompare(b.class.name, 'fr') ||
        a.lastName.localeCompare(b.lastName, 'fr') ||
        a.firstName.localeCompare(b.firstName, 'fr'),
    );
  }

  async create(dto: StudentDto, ctx: StudentsContext) {
    await this.checkClass(dto.classId);
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          classId: dto.classId,
          parentPhone: dto.parentPhone,
          mealService: dto.mealService,
          active: dto.active ?? true,
        },
        select: STUDENT_SELECT,
      });
      await this.audit.log(
        'STUDENT_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Student', targetId: student.id, details: { action: 'create', classId: dto.classId } },
        tx,
      );
      return student;
    });
  }

  async update(id: string, dto: StudentDto, ctx: StudentsContext) {
    const current = UUID.test(id) ? await this.prisma.student.findUnique({ where: { id } }) : null;
    if (!current) throw new AppException('NOT_FOUND');
    if (dto.classId !== current.classId) await this.checkClass(dto.classId);
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          classId: dto.classId,
          parentPhone: dto.parentPhone,
          mealService: dto.mealService,
          active: dto.active ?? current.active,
        },
        select: STUDENT_SELECT,
      });
      await this.audit.log(
        'STUDENT_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Student', targetId: id, details: { action: 'update', fields: changedFields(current, dto) } },
        tx,
      );
      return student;
    });
  }

  /** Classe d'élèves : active et rattachée à un niveau (une salle sans niveau n'accueille pas d'élèves). */
  private async checkClass(classId: string): Promise<void> {
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: classId }, select: { active: true, levelId: true } });
    if (!schoolClass || !schoolClass.active || !schoolClass.levelId) {
      throw invalid('classId', 'Choisissez une classe active d’un niveau scolaire.');
    }
  }
}
