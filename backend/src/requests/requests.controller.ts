import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../auth/request-info';
import type { Page } from '../common/pagination';
import { CreateRequestDto, ListRequestsQuery, UpdateDraftDto } from './requests.dto';
import type { RequestDetail, RequestSummary } from './requests.mapper';
import { RequestsService, type RequestContext } from './requests.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

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
