import { Module } from '@nestjs/common';
import { SuperAdminGuard } from '../common/super-admin.guard';
import { RequestPolicyLoader } from '../requests/request-policy.loader';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, AdminCategoriesService, RequestPolicyLoader, SuperAdminGuard],
})
export class CategoriesModule {}
