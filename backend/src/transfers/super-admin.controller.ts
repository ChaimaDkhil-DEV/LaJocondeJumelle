import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Page } from '../common/pagination';
import { clientIp, requestPath } from '../common/request-info';
import type { RequestDetail } from '../requests/requests.mapper';
import type { RequestContext } from '../requests/requests.service';
import { SupervisionService, type AdministratorLoad, type SupervisedRequest } from './supervision.service';
import { AllTransfersQuery, ReassignOwnerDto, SupervisedRequestsQuery } from './transfers.dto';
import type { AdminRefView, TransferView } from './transfers.mapper';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Supervision et réattribution (018, US5, contracts/api.md) : super administrateur seulement ; chaque
 * refus est journalisé par la garde. Les comptes administrateurs et le journal d'audit restent gérés par
 * /admin/users et /admin/audit (D5).
 */
@Controller('super-admin')
@UseGuards(SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly supervision: SupervisionService) {}

  /** Toutes les demandes « via l'administration » avec leur responsable, filtrées. */
  @Get('requests')
  requests(@Query() query: SupervisedRequestsQuery): Promise<Page<SupervisedRequest>> {
    return this.supervision.supervised(query);
  }

  /** Administrateurs et leur charge. */
  @Get('administrators')
  administrators(): Promise<AdministratorLoad[]> {
    return this.supervision.administrators();
  }

  /** Toutes les propositions de transfert, par statut. */
  @Get('transfers')
  transfers(@CurrentUser() user: AuthenticatedUser, @Query() query: AllTransfersQuery): Promise<Page<TransferView>> {
    return this.supervision.transfers(user, query);
  }

  /** Administrateurs à qui la demande peut être réattribuée (actifs, admins de sa catégorie). */
  @Get('requests/:id/reassign-candidates')
  reassignCandidates(@Param('id') id: string): Promise<AdminRefView[]> {
    return this.supervision.reassignCandidates(id);
  }

  /** Réattribution administrative ou libération (`adminId` null), avec motif. */
  @Post('requests/:id/reassign')
  @HttpCode(200)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignOwnerDto,
    @Req() req: Request,
  ): Promise<RequestDetail> {
    return this.supervision.reassign(user, id, dto, contextOf(req));
  }
}
