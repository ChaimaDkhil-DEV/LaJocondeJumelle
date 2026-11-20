import { Module } from '@nestjs/common';
import { StudentSituationController } from './student-situation.controller';
import { StudentSituationService } from './student-situation.service';
import { StudentsController } from './students.controller';
import { StudentsImportService } from './students-import.service';
import { StudentsService } from './students.service';

/** Niveaux scolaires et élèves. */
@Module({
  controllers: [StudentsController, StudentSituationController],
  providers: [StudentsService, StudentsImportService, StudentSituationService],
})
export class StudentsModule {}
