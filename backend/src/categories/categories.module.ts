import { Module } from '@nestjs/common';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [RequestPolicyModule],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, AdminCategoriesService, SuperAdminGuard],
})
export class CategoriesModule {}
