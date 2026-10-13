import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../auth/request-info';
import { SuperAdminGuard } from '../common/super-admin.guard';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService, type AdminUser } from './users.service';

@Controller('admin/users')
@UseGuards(SuperAdminGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<AdminUser[]> {
    return this.users.list();
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto, @Req() req: Request) {
    return this.users.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    return this.users.update(id, dto, { actor, ip: clientIp(req) });
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Req() req: Request) {
    return this.users.resetPassword(id, { actor, ip: clientIp(req) });
  }
}
