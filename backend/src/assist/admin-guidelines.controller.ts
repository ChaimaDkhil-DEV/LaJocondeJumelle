import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { CreateGuidelineDto, UpdateGuidelineDto } from './guidelines.dto';
import { GuidelinesService } from './guidelines.service';

@Controller('admin/guidelines')
@UseGuards(SuperAdminGuard)
export class AdminGuidelinesController {
  constructor(private readonly guidelines: GuidelinesService) {}

  @Get()
  list() {
    return this.guidelines.list();
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateGuidelineDto, @Req() req: Request) {
    return this.guidelines.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateGuidelineDto, @Req() req: Request) {
    return this.guidelines.update(id, dto, { actor, ip: clientIp(req) });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.guidelines.remove(id, { actor, ip: clientIp(req) });
  }
}
