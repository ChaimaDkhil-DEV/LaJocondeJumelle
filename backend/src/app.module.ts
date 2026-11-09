import { Module } from '@nestjs/common';
import { AssistModule } from './assist/assist.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { PrismaModule } from './common/prisma.service';
import { ConfigModule } from './config/config.module';
import { AttendanceModule } from './attendance/attendance.module';
import { CoverageModule } from './coverage/coverage.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';
import { RealtimeGatewayModule } from './realtime/realtime-gateway.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RequestsModule } from './requests/requests.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettingsModule } from './settings/settings.module';
import { StudentsModule } from './students/students.module';
import { UsersModule } from './users/users.module';
import { ParentCommunicationsModule } from './parent-communications/parent-communications.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    SettingsModule,
    RealtimeModule,
    PushModule,
    NotificationsModule,
    AuthModule,
    FilesModule,
    CategoriesModule,
    RequestsModule,
    AssistModule,
    CoverageModule,
    AttendanceModule,
    DashboardModule,
    MessagesModule,
    SchedulerModule,
    UsersModule,
    StudentsModule,
    ParentCommunicationsModule,
    IntegrationsModule,
    RealtimeGatewayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
