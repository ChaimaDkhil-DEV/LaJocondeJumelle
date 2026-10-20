import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../common/request-info';
import type { Page } from '../common/pagination';
import { RequestTransitionsService } from './request-transitions.service';
import { ChangePriorityDto, CreateRequestDto, ListRequestsQuery, RequestActionDto, UpdateDraftDto } from './requests.dto';
import type { RequestDetail, RequestSummary } from './requests.mapper';
import { RequestsService, type RequestContext } from './requests.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly transitions: RequestTransitionsService,
  ) {}

  /** 201 à la création ; 200 si le même clientId a déjà été reçu (renvoi idempotent). */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RequestDetail> {
    const { created, detail } = await this.requests.create(user, dto, contextOf(req));
    res.status(created ? 201 : 200);
    return detail;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListRequestsQuery): Promise<Page<RequestSummary>> {
    return this.requests.list(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<RequestDetail> {
    return this.requests.detail(user, id, contextOf(req));
  }

  /** Historique complet de la demande, du plus ancien au plus récent. */
  @Get(':id/history')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.requests.history(user, id, contextOf(req));
  }

  /** Changement de priorité, tracé dans l'historique. */
  @Patch(':id/priority')
  changePriority(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangePriorityDto,
    @Req() req: Request,
  ): Promise<RequestDetail> {
    return this.requests.changePriority(user, id, dto, contextOf(req));
  }

  /** Employés affectables (admins : approbation en circuit B, réaffectation). */
  @Get(':id/assignees')
  assignees(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.requests.assignees(user, id, contextOf(req));
  }

  /** Transition de statut ; renvoie la demande à jour (allowedActions recalculées). */
  @Post(':id/actions')
  @HttpCode(200)
  async act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestActionDto,
    @Req() req: Request,
  ): Promise<RequestDetail> {
    const ctx = contextOf(req);
    await this.transitions.perform(user, id, dto, ctx);
    return this.requests.detail(user, id, ctx);
  }

  @Patch(':id')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
    @Req() req: Request,
  ): Promise<RequestDetail> {
    return this.requests.updateDraft(user, id, dto, contextOf(req));
  }

  @Delete(':id')
  @HttpCode(204)
  deleteDraft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<void> {
    return this.requests.deleteDraft(user, id, contextOf(req));
  }
}
