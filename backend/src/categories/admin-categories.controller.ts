import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { CreateCategoryDto, DeadlineRulesDto, MembersDto, UpdateCategoryDto } from './admin-categories.dto';
import { AdminCategoriesService } from './admin-categories.service';

@Controller('admin/categories')
@UseGuards(SuperAdminGuard)
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCategoryDto, @Req() req: Request) {
    return this.categories.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto, @Req() req: Request) {
    return this.categories.update(id, dto, { actor, ip: clientIp(req) });
  }

  @Put(':id/recipients')
  recipients(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: MembersDto, @Req() req: Request) {
    return this.categories.setRecipients(id, dto.userIds, { actor, ip: clientIp(req) });
  }

  @Put(':id/managers')
  managers(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: MembersDto, @Req() req: Request) {
    return this.categories.setManagers(id, dto.userIds, { actor, ip: clientIp(req) });
  }

  @Get(':id/deadlines')
  deadlines(@Param('id') id: string) {
    return this.categories.deadlines(id);
  }

  @Put(':id/deadlines')
  setDeadlines(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: DeadlineRulesDto, @Req() req: Request) {
    return this.categories.setDeadlines(id, dto, { actor, ip: clientIp(req) });
  }
}
