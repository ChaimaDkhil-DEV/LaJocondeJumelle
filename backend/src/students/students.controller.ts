import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp } from '../common/request-info';
import { StudentDto } from './students.dto';
import { StudentsService } from './students.service';

/** Niveaux et élèves : données de référence, super administrateur uniquement (comme les classes). */
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('levels')
  levels() {
    return this.students.levels();
  }

  @Get('students')
  list() {
    return this.students.list();
  }

  @Post('students')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: StudentDto, @Req() req: Request) {
    return this.students.create(dto, { actor, ip: clientIp(req) });
  }

  @Patch('students/:id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: StudentDto, @Req() req: Request) {
    return this.students.update(id, dto, { actor, ip: clientIp(req) });
  }
}
