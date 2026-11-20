import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { AuditTrailQuery, SituationQuery } from './student-situation.dto';
import { StudentSituationService } from './student-situation.service';

/**
 * Historique des classes et situation d'un élève (021) : administration seulement (admin et super administrateur).
 * Un autre rôle est refusé par la garde, qui journalise le refus sans rien révéler de l'élève.
 */
@Controller('admin/students')
@UseGuards(AdministrationGuard)
export class StudentSituationController {
  constructor(private readonly situation: StudentSituationService) {}

  @Get(':id/class-history')
  classHistory(@Param('id') id: string) {
    return this.situation.classHistory(id);
  }

  /** Situation à une date et une heure précises (021) : lecture seule. */
  @Get(':id/situation')
  situationAt(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Query() query: SituationQuery, @Req() req: Request) {
    return this.situation.situation(id, query.at, { actor, ip: clientIp(req) });
  }

  /** Journal de l'élève : ses modifications et les consultations de sa situation. */
  @Get(':id/audit')
  auditTrail(@Param('id') id: string, @Query() query: AuditTrailQuery) {
    return this.situation.auditTrail(id, query);
  }
}
