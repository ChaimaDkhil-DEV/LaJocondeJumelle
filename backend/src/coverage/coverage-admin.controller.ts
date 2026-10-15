import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { SuperAdminGuard } from '../common/super-admin.guard';
import { CoverageAdminService } from './coverage-admin.service';
import { ClassDto, GroupDto, ListCoverageQuery } from './coverage.dto';

/** Données de référence et tableau de suivi des couvertures : super administrateur uniquement. */
@Controller('admin/coverage')
@UseGuards(SuperAdminGuard)
export class CoverageAdminController {
  constructor(private readonly admin: CoverageAdminService) {}

  @Get('dashboard')
  dashboard(@Query() query: ListCoverageQuery) {
    return this.admin.dashboard(query);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="suivi-couvertures.csv"')
  @Header('Cache-Control', 'private, no-store')
  exportCsv(@Query() query: ListCoverageQuery) {
    return this.admin.exportCsv(query);
  }

  @Get('groups')
  groups() {
    return this.admin.groups();
  }

  @Post('groups')
  createGroup(@CurrentUser() actor: AuthenticatedUser, @Body() dto: GroupDto, @Req() req: Request) {
    return this.admin.createGroup(dto, { actor, ip: clientIp(req) });
  }

  @Patch('groups/:id')
  updateGroup(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: GroupDto, @Req() req: Request) {
    return this.admin.updateGroup(id, dto, { actor, ip: clientIp(req) });
  }

  @Get('classes')
  classes() {
    return this.admin.classes();
  }

  @Post('classes')
  createClass(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ClassDto, @Req() req: Request) {
    return this.admin.createClass(dto, { actor, ip: clientIp(req) });
  }

  @Patch('classes/:id')
  updateClass(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClassDto, @Req() req: Request) {
    return this.admin.updateClass(id, dto, { actor, ip: clientIp(req) });
  }

  /** Lien du QR code imprimable (version en cours). */
  @Get('classes/:id/qr')
  qr(@Param('id') id: string) {
    return this.admin.qr(id);
  }

  /** Révoque les QR imprimés de la classe et renvoie le nouveau lien à imprimer. */
  @Post('classes/:id/qr/revoke')
  revokeQr(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.admin.revokeQr(id, { actor, ip: clientIp(req) });
  }
}
