import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportCsvDto } from '../common/csv-import';
import { clientIp } from '../common/request-info';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import type { Page } from '../common/pagination';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';
import { UsersImportService } from './users-import.service';
import { UsersService, type AdminUser } from './users.service';

@Controller('admin/users')
@UseGuards(SuperAdminGuard)
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly usersImport: UsersImportService,
  ) {}

  @Get()
  list(@Query() query: ListUsersQuery): Promise<Page<AdminUser>> {
    return this.users.list(query);
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto, @Req() req: Request) {
    return this.users.create(dto, { actor, ip: clientIp(req) });
  }

  /**
   * Import de comptes depuis un fichier CSV. `dryRun: true` vérifie sans rien créer ; sinon tout est créé ou rien,
   * et les mots de passe provisoires ne sont renvoyés que dans cette réponse.
   */
  @Post('import')
  @HttpCode(200)
  importAccounts(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ImportCsvDto, @Req() req: Request) {
    return this.usersImport.run(dto, { actor, ip: clientIp(req) });
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
