import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdministrationGuard } from '../audit/administration.guard';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { AdminUsersController } from './admin-users.controller';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { EmployeesController } from './employees.controller';
import { UsersImportService } from './users-import.service';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController, EmployeesController, AvatarController],
  providers: [UsersService, UsersImportService, AvatarService, SuperAdminGuard, AdministrationGuard],
})
export class UsersModule {}
