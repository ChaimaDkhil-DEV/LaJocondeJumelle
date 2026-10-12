import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RequestPolicyLoader } from './request-policy.loader';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [FilesModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestPolicyLoader],
  exports: [RequestsService],
})
export class RequestsModule {}
