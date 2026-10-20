import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoverageModule } from '../coverage/coverage.module';
import { FilesModule } from '../files/files.module';
import { RequestsModule } from '../requests/requests.module';
import { AutoCloseJob } from './auto-close.job';
import { CoverageDeadlinesJob } from './coverage-deadlines.job';
import { CoverageRemindersJob } from './coverage-reminders.job';
import { OrphanFilesJob } from './orphan-files.job';
import { OverdueJob } from './overdue.job';
import { SessionRevalidationJob } from './session-revalidation.job';
import { SuperAdminAlertsJob } from './super-admin-alerts.job';

@Module({
  imports: [ScheduleModule.forRoot(), RequestsModule, FilesModule, CoverageModule],
  providers: [
    AutoCloseJob,
    OverdueJob,
    SessionRevalidationJob,
    OrphanFilesJob,
    CoverageDeadlinesJob,
    CoverageRemindersJob,
    SuperAdminAlertsJob,
  ],
})
export class SchedulerModule {}
