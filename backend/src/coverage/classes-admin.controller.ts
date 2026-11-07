import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { CoverageAdminService } from './coverage-admin.service';
import { ClassDto } from './coverage.dto';

/** Classes et leurs QR codes : données de référence, admin et super administrateur (011, FR-001, FR-002). */
@Controller('admin/coverage/classes')
@UseGuards(AdministrationGuard)
export class ClassesAdminController {
  constructor(private readonly admin: CoverageAdminService) {}

  @Get()
  classes() {
    return this.admin.classes();
  }

  @Post()
  createClass(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ClassDto, @Req() req: Request) {
    return this.admin.createClass(dto, { actor, ip: clientIp(req) });
  }

  @Patch(':id')
  updateClass(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: ClassDto, @Req() req: Request) {
    return this.admin.updateClass(id, dto, { actor, ip: clientIp(req) });
  }

  /** Lien du QR code imprimable (version en cours). */
  @Get(':id/qr')
  qr(@Param('id') id: string) {
    return this.admin.qr(id);
  }

  /** Révoque les QR imprimés de la classe et renvoie le nouveau lien à imprimer. */
  @Post(':id/qr/revoke')
  revokeQr(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.admin.revokeQr(id, { actor, ip: clientIp(req) });
  }
}
