import { Module } from '@nestjs/common';
import { RequestPolicyLoader } from '../requests/request-policy.loader';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, RequestPolicyLoader],
})
export class CategoriesModule {}
