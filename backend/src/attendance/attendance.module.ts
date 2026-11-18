import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceGate } from './attendance-gate.service';
import { AttendanceService } from './attendance.service';
import { ExpectedTeachersService } from './expected-teachers.service';
import { PresenceService } from './presence.service';

/** Pointage des enseignants par QR : réutilise le QR, les groupes, les notifications et l'audit du module Gardes. */
@Module({
  imports: [CoverageModule],
  controllers: [AttendanceController],
  providers: [AttendanceGate, PresenceService, AttendanceService, ExpectedTeachersService],
  /** La garde des droits sert aussi aux emplois du temps (020). */
  exports: [AttendanceGate],
})
export class AttendanceModule {}
