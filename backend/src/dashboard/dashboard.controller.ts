import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { DashboardActivityQuery, DashboardQuery } from './dashboard.dto';
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
}
