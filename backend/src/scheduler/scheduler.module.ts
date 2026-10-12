import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestsModule } from '../requests/requests.module';
import { AutoCloseJob } from './auto-close.job';
import { SessionRevalidationJob } from './session-revalidation.job';

@Module({
  imports: [ScheduleModule.forRoot(), RequestsModule],
  providers: [AutoCloseJob, SessionRevalidationJob],
})
export class SchedulerModule {}
