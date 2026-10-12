import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { PrismaModule } from './common/prisma.service';
import { ConfigModule } from './config/config.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeGatewayModule } from './realtime/realtime-gateway.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RequestsModule } from './requests/requests.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    SettingsModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    FilesModule,
    CategoriesModule,
    RequestsModule,
    MessagesModule,
    SchedulerModule,
    RealtimeGatewayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
