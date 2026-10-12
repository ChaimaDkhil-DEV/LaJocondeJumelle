import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './common/prisma.service';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, SettingsModule, NotificationsModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
