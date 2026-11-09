import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { setCsvDownloadHeaders } from '../common/csv';
import { DashboardActivityQuery, DashboardQuery, DashboardRequestsQuery } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

/** Tableau de bord de supervision des demandes de travail : super administrateur uniquement, lecture seule. */
@Controller('admin/dashboard')
@UseGuards(SuperAdminGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Query() query: DashboardQuery) {
    return this.dashboard.summary(query);
  }

  @Get('performance')
  performance(@Query() query: DashboardQuery) {
    return this.dashboard.performance(query);
  }

  @Get('employees')
  employees(@Query() query: DashboardQuery) {
    return this.dashboard.employees(query);
  }

  @Get('activity')
  activity(@Query() query: DashboardActivityQuery) {
    return this.dashboard.activity(query);
  }

  /** Demandes comptées par un chiffre de la synthèse (cartes et « À traiter maintenant »). */
  @Get('requests')
  requests(@Query() query: DashboardRequestsQuery) {
    return this.dashboard.requests(query);
  }

  @Get('export.csv')
  async exportCsv(@Query() query: DashboardQuery, @Res({ passthrough: true }) res: Response) {
    const body = await this.dashboard.exportCsv(query);
    setCsvDownloadHeaders(res, 'demandes-de-travail.csv');
    return body;
  }
}
