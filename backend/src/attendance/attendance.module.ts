import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

/** Pointage des enseignants par QR : réutilise le QR, les groupes, les notifications et l'audit du module Gardes. */
@Module({
  imports: [CoverageModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
