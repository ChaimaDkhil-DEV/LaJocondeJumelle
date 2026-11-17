import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceGate } from './attendance-gate.service';
import { AttendanceService } from './attendance.service';
import { PresenceService } from './presence.service';

/** Pointage des enseignants par QR : réutilise le QR, les groupes, les notifications et l'audit du module Gardes. */
@Module({
  imports: [CoverageModule],
  controllers: [AttendanceController],
  providers: [AttendanceGate, PresenceService, AttendanceService],
})
export class AttendanceModule {}
