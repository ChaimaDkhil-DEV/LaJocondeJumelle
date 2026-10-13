import { Global, Module } from '@nestjs/common';
import { SuperAdminGuard } from '../common/super-admin.guard';
import { AdminSettingsController, ClientSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { SettingsService } from './settings.service';

@Global()
@Module({
  controllers: [AdminSettingsController, ClientSettingsController],
  providers: [SettingsService, AdminSettingsService, SuperAdminGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
