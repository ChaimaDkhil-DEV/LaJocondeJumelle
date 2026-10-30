import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

/** Niveaux scolaires et élèves. */
@Module({
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
