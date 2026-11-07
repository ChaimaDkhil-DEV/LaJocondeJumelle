import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { setCsvDownloadHeaders } from '../common/csv';
import { clientIp } from '../common/request-info';
import { AdministrationGuard } from '../audit/administration.guard';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { CoverageAdminService } from './coverage-admin.service';
import { FloorDto, GroupDto, ListCoverageQuery, UpdateFloorDto } from './coverage.dto';

/**
 * Tableau de suivi des affectations, export et groupes : super administrateur uniquement.
 * Les classes (classes-admin.controller.ts) et les étages sont ouverts à l'admin (011).
 */
@Controller('admin/coverage')
@UseGuards(SuperAdminGuard)
export class CoverageAdminController {
  constructor(private readonly admin: CoverageAdminService) {}

  @Get('dashboard')
  dashboard(@Query() query: ListCoverageQuery) {
    return this.admin.dashboard(query);
  }

  @Get('export.csv')
  async exportCsv(@Query() query: ListCoverageQuery, @Res({ passthrough: true }) res: Response) {
    const body = await this.admin.exportCsv(query);
    setCsvDownloadHeaders(res, 'suivi-affectations.csv');
    return body;
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

}

/** Étages (004, FR-006) : données de référence, admin et super administrateur (011, FR-001). */
@Controller('admin/floors')
@UseGuards(AdministrationGuard)
export class FloorsAdminController {
  constructor(private readonly admin: CoverageAdminService) {}

  @Get()
  floors() {
    return this.admin.floors();
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: FloorDto, @Req() req: Request) {
    return this.admin.createFloor(dto, { actor, ip: clientIp(req) });
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateFloorDto, @Req() req: Request) {
    return this.admin.updateFloor(id, dto, { actor, ip: clientIp(req) });
  }
}
