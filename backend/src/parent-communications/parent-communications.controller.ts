import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdministrationGuard } from '../audit/administration.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { GuardiansService } from './guardians.service';
import { GuardianAccountDto, GuardianDto, TeacherClassesDto, UpdateGuardianDto } from './parent-communications.dto';

// Les conversations (enseignant, parent, administration) sont dans communications.controller.ts (017).

/** Représentants légaux et classes des enseignants : admin et super administrateur (comme les élèves). */
@Controller('admin')
@UseGuards(AdministrationGuard)
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get('guardians')
  list() {
    return this.guardians.list();
  }

  @Post('guardians')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: GuardianDto, @Req() req: Request) {
    return this.guardians.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch('guardians/:id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGuardianDto,
    @Req() req: Request,
  ) {
    return this.guardians.update(id, dto, { actor, ip: clientIp(req) });
  }

  @Post('guardians/:id/account')
  createAccount(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuardianAccountDto,
    @Req() req: Request,
  ) {
    return this.guardians.createAccount(id, dto, { actor, ip: clientIp(req) });
  }

  @Get('teacher-classes')
  teacherClasses() {
    return this.guardians.teacherClasses();
  }

  @Put('teacher-classes/:teacherId')
  setTeacherClasses(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('teacherId') teacherId: string,
    @Body() dto: TeacherClassesDto,
    @Req() req: Request,
  ) {
    return this.guardians.setTeacherClasses(teacherId, dto, { actor, ip: clientIp(req) });
  }
}
