import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../common/request-info';
import type { RequestContext } from '../requests/requests.service';
import { CorrectAttendanceDto, DayQuery, ManualAttendanceDto, QrTokenDto, SetSubstituteDto } from './attendance.dto';
import { AttendanceService } from './attendance.service';

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/**
 * Pointage des enseignants par QR. L'identité vient de la session, l'heure du serveur, les droits sont
 * revérifiés par le service (attendance.service.ts) : le frontend n'est jamais cru sur parole.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** Enseignant : page du QR (classe, pointage du jour, rattachement prévu), sans rien enregistrer. */
  @Post('resolve')
  @HttpCode(200)
  resolve(@CurrentUser() user: AuthenticatedUser, @Body() dto: QrTokenDto, @Req() req: Request) {
    return this.attendance.resolve(user, dto.token, contextOf(req));
  }

  /** Enseignant : enregistre son arrivée ; 201 pour un nouveau pointage, 200 si le jour est déjà pointé. */
  @Post('arrive')
  async arrive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: QrTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.attendance.arrive(user, dto.token, contextOf(req));
    res.status(result.created ? 201 : 200);
    return result;
  }

  /** Enseignant : « Mes présences ». */
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.attendance.mine(user, contextOf(req));
  }

  /** Admins : suivi de la journée. */
  @Get('day')
  day(@CurrentUser() user: AuthenticatedUser, @Query() query: DayQuery, @Req() req: Request) {
    return this.attendance.day(user, query, contextOf(req));
  }

  /** Admins : régularisation d'un oubli de scan. */
  @Post('manual')
  manual(@CurrentUser() user: AuthenticatedUser, @Body() dto: ManualAttendanceDto, @Req() req: Request) {
    return this.attendance.recordManual(user, dto, contextOf(req));
  }

  /** Admins : désigne (ou retire) le remplaçant d'une absence annoncée. Déclarée avant `:id`. */
  @Patch('substitutes/:requestId')
  substitute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: SetSubstituteDto,
    @Req() req: Request,
  ) {
    return this.attendance.setSubstitute(user, requestId, dto, contextOf(req));
  }

  /** Admins : correction ou qualification d'un pointage, motif obligatoire. */
  @Patch(':id')
  correct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CorrectAttendanceDto, @Req() req: Request) {
    return this.attendance.correct(user, id, dto, contextOf(req));
  }
}
