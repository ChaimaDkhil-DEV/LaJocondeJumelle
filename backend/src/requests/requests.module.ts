import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RequestPolicyModule } from './request-policy.module';
import { RequestTransitionsService } from './request-transitions.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [FilesModule, RequestPolicyModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestTransitionsService],
  exports: [RequestsService, RequestTransitionsService],
})
export class RequestsModule {}
