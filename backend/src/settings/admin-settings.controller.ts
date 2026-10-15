import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { AdminSettingsService } from './admin-settings.service';

@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminSettingsController {
  constructor(private readonly admin: AdminSettingsService) {}

  @Get('settings')
  settings() {
    return this.admin.getSettings();
  }

  /** Corps libre validé réglage par réglage (clés connues, valeurs bornées). */
  @Put('settings')
  updateSettings(@CurrentUser() actor: AuthenticatedUser, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.admin.updateSettings(body, { actor, ip: clientIp(req) });
  }

  @Get('role-permissions')
  rolePermissions() {
    return this.admin.rolePermissions();
  }

  @Put('role-permissions')
  replaceRolePermissions(@CurrentUser() actor: AuthenticatedUser, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.admin.replaceRolePermissions(body, { actor, ip: clientIp(req) });
  }
}

/** Réglages nécessaires à l'interface (durée maximale des vocaux, pièces jointes, brouillons). */
@Controller('settings')
export class ClientSettingsController {
  constructor(private readonly admin: AdminSettingsService) {}

  @Get('client')
  client() {
    return this.admin.clientSettings();
  }
}
