import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ImportCsvDto } from '../common/csv-import';
import { clientIp } from '../common/request-info';
import { LevelDto, StudentDto, UpdateLevelDto } from './students.dto';
import { StudentsImportService } from './students-import.service';
import { StudentsService } from './students.service';

/** Niveaux et élèves : données de référence, super administrateur uniquement (comme les classes). */
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly studentsImport: StudentsImportService,
  ) {}

  @Get('levels')
  levels() {
    return this.students.levels();
  }

  @Post('levels')
  createLevel(@CurrentUser() actor: AuthenticatedUser, @Body() dto: LevelDto, @Req() req: Request) {
    return this.students.createLevel(dto, { actor, ip: clientIp(req) });
  }

  @Patch('levels/:id')
  updateLevel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLevelDto, @Req() req: Request) {
    return this.students.updateLevel(id, dto, { actor, ip: clientIp(req) });
  }

  @Get('students')
  list() {
    return this.students.list();
  }

  /** Import d'élèves depuis un fichier CSV : `dryRun: true` vérifie sans rien créer, sinon tout est créé ou rien. */
  @Post('students/import')
  @HttpCode(200)
  importStudents(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ImportCsvDto, @Req() req: Request) {
    return this.studentsImport.run(dto, { actor, ip: clientIp(req) });
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
