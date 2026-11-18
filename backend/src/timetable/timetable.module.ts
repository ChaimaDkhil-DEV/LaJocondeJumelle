import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

/**
 * Emplois du temps des enseignants (020) : écritures de l'administration et lecture par l'enseignant. Les droits
 * reprennent ceux du suivi des présences (AttendanceGate, exporté par AttendanceModule).
 */
@Module({
  imports: [AttendanceModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
