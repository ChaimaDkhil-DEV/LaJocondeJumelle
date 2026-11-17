import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Page } from '../common/pagination';
import { clientIp, requestPath } from '../common/request-info';
import type { RequestDetail, RequestSummary } from '../requests/requests.mapper';
import type { RequestContext } from '../requests/requests.service';
import { ClaimRequestDto, OwnedRequestsQuery, PageQuery, ProposeTransferDto } from './transfers.dto';
import type { AdminRefView, AssignmentView, TransferView } from './transfers.mapper';
import { TransfersService } from './transfers.service';
import { WorkspaceService, type QueueItem, type WorkspaceSummary } from './workspace.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Espace de travail des administrateurs (018, contracts/api.md) : admin et super administrateur actifs
 * (AdministrationGuard) ; les règles fines — catégories de l'admin, responsable — sont dans le service.
 */
@Controller('admin')
@UseGuards(AdministrationGuard)
export class AdminRequestsController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly transfers: TransfersService,
  ) {}

  /** File commune : demandes libres en attente de validation. */
  @Get('requests/available')
  available(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQuery): Promise<Page<QueueItem>> {
    return this.workspace.available(user, query);
  }

  /** Demandes dont l'utilisateur connecté est responsable (toutes, en cours, terminées). */
  @Get('requests/mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: OwnedRequestsQuery): Promise<Page<RequestSummary>> {
    return this.workspace.mine(user, query);
  }

  /** Compteurs du tableau de bord de l'espace de travail. */
  @Get('requests/summary')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<WorkspaceSummary> {
    return this.workspace.summary(user);
  }

  /** « Prendre en charge » ; renvoie la demande à jour. 409 si un collègue l'a prise entre-temps. */
  @Post('requests/:id/claim')
  @HttpCode(200)
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ClaimRequestDto,
    @Req() req: Request,
  ): Promise<RequestDetail> {
    return this.workspace.claim(user, id, dto.version, contextOf(req));
  }

  /** Historique des responsables d'une demande. */
  @Get('requests/:id/assignments')
  assignments(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<AssignmentView[]> {
    return this.workspace.assignments(user, id, contextOf(req));
  }

  /** Collègues à qui le responsable peut proposer une délégation : nom et fonction seulement. */
  @Get('requests/:id/transfer-candidates')
  candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<AdminRefView[]> {
    return this.transfers.candidates(user, id, contextOf(req));
  }

  /** Proposition de transfert : délégation (par le responsable) ou demande de reprise (par un collègue). */
  @Post('requests/:id/transfers')
  propose(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProposeTransferDto,
    @Req() req: Request,
  ): Promise<TransferView> {
    return this.transfers.propose(user, id, dto, contextOf(req));
  }

  /** « Mon historique ». */
  @Get('assignments/mine')
  myAssignments(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQuery): Promise<Page<AssignmentView>> {
    return this.workspace.myAssignments(user, query);
  }
}
