import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { recordMealChange } from './meal-change';
import type { ChangeMealServiceDto } from './students.dto';
import { byLevelClassAndName, type StudentsContext } from './students.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sans téléphone du parent : l'administration n'en a pas besoin pour changer le service. */
const MEAL_STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  mealService: true,
  class: { select: { id: true, name: true, level: { select: { id: true, name: true, position: true } } } },
} as const;

/** Passage d'un élève de la cantine au panier, ou l'inverse, avec historique par élève. */
@Injectable()
export class StudentMealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Élèves actifs, dans le même ordre que la liste du super administrateur. */
  async list() {
    const students = await this.prisma.student.findMany({ where: { active: true }, select: MEAL_STUDENT_SELECT });
    return students.sort(byLevelClassAndName);
  }

  async change(id: string, dto: ChangeMealServiceDto, ctx: StudentsContext) {
    const current = UUID.test(id) ? await this.prisma.student.findUnique({ where: { id } }) : null;
    if (!current || !current.active) throw new AppException('NOT_FOUND');
    if (current.mealService === dto.mealService) {
      const message = 'L’élève est déjà inscrit à ce service.';
      throw new AppException('VALIDATION_ERROR', { fields: [{ field: 'mealService', messages: [message] }] }, message);
    }

    return this.prisma.$transaction(async (tx) => {
      // La condition sur l'ancien service évite d'écrire un historique faux si deux personnes agissent en même temps.
      const { count } = await tx.student.updateMany({
        where: { id, active: true, mealService: current.mealService },
        data: { mealService: dto.mealService },
      });
      if (count === 0) throw new AppException('STATE_CHANGED');
      await recordMealChange(tx, {
        studentId: id,
        from: current.mealService,
        to: dto.mealService,
        actorId: ctx.actor.id,
        reason: dto.reason,
      });
      // Comme pour les autres modifications d'élèves, le journal ne garde aucune valeur.
      await this.audit.log(
        'STUDENT_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Student', targetId: id, details: { action: 'update', fields: ['mealService'] } },
        tx,
      );
      return tx.student.findUniqueOrThrow({ where: { id }, select: MEAL_STUDENT_SELECT });
    });
  }

  /** Changements d'un élève, du plus récent au plus ancien ; un élève désactivé garde le sien. */
  async history(id: string) {
    const student = UUID.test(id) ? await this.prisma.student.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!student) throw new AppException('NOT_FOUND');
    return this.prisma.studentMealChange.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fromService: true,
        toService: true,
        reason: true,
        createdAt: true,
        actor: { select: { id: true, displayName: true } },
      },
    });
  }
}
