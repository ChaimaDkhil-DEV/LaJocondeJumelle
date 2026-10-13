import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FilesModule } from '../files/files.module';
import { RequestsModule } from '../requests/requests.module';
import { AutoCloseJob } from './auto-close.job';
import { OrphanFilesJob } from './orphan-files.job';
import { OverdueJob } from './overdue.job';
import { SessionRevalidationJob } from './session-revalidation.job';

@Module({
  imports: [ScheduleModule.forRoot(), RequestsModule, FilesModule],
  providers: [AutoCloseJob, OverdueJob, SessionRevalidationJob, OrphanFilesJob],
})
export class SchedulerModule {}
