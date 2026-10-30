import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { AdminUsersController } from './admin-users.controller';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController, AvatarController],
  providers: [UsersService, AvatarService, SuperAdminGuard],
})
export class UsersModule {}
