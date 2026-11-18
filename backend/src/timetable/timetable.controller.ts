import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../common/request-info';
import type { RequestContext } from '../requests/requests.service';
import {
  CancelDto,
  CancelSeriesDto,
  CreateSeriesDto,
  CreateSessionDto,
  MineQuery,
  SeriesQuery,
  SessionsQuery,
  UpdateSeriesDto,
  UpdateSessionDto,
} from './timetable.dto';
import { TimetableService } from './timetable.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Emplois du temps (020) — contracts/api.md. Les droits sont revérifiés par le service (AttendanceGate) ;
 * l'identité vient de la session, l'heure du serveur.
 */
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  /** Enseignant : son propre emploi du temps (14 jours au plus) ; aucun autre enseignant ne peut être demandé. */
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: MineQuery, @Req() req: Request) {
    return this.timetable.mine(user, query, contextOf(req));
  }

  /** Administration : séances d'une période (31 jours au plus). */
  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser, @Query() query: SessionsQuery, @Req() req: Request) {
    return this.timetable.listSessions(user, query, contextOf(req));
  }

  /** Administration : séance isolée. */
  @Post('sessions')
  createSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSessionDto, @Req() req: Request) {
    return this.timetable.createSession(user, dto, contextOf(req));
  }

  /** Administration : modification d'une séance seule (détachée de sa série). */
  @Patch('sessions/:id')
  updateSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSessionDto, @Req() req: Request) {
    return this.timetable.updateSession(user, id, dto, contextOf(req));
  }

  /** Administration : annulation d'une séance, motif obligatoire. */
  @Post('sessions/:id/cancel')
  @HttpCode(200)
  cancelSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelDto, @Req() req: Request) {
    return this.timetable.cancelSession(user, id, dto, contextOf(req));
  }

  /** Administration : séries hebdomadaires. */
  @Get('series')
  series(@CurrentUser() user: AuthenticatedUser, @Query() query: SeriesQuery, @Req() req: Request) {
    return this.timetable.listSeries(user, query, contextOf(req));
  }

  /** Administration : série hebdomadaire et ses séances, tout ou rien. */
  @Post('series')
  createSeries(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSeriesDto, @Req() req: Request) {
    return this.timetable.createSeries(user, dto, contextOf(req));
  }

  /** Administration : changement d'une série à partir d'une date. */
  @Patch('series/:id')
  updateSeries(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSeriesDto, @Req() req: Request) {
    return this.timetable.updateSeries(user, id, dto, contextOf(req));
  }

  /** Administration : annulation des séances d'une série entre deux dates. */
  @Post('series/:id/cancel')
  @HttpCode(200)
  cancelSeries(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelSeriesDto, @Req() req: Request) {
    return this.timetable.cancelSeriesRange(user, id, dto, contextOf(req));
  }
}
