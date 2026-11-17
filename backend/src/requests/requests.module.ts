import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RequestOwnershipService } from './request-ownership.service';
import { RequestPolicyModule } from './request-policy.module';
import { RequestTransitionsService } from './request-transitions.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { WorkFileAccess } from './work-file-access';

@Module({
  imports: [FilesModule, RequestPolicyModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestTransitionsService, RequestOwnershipService, WorkFileAccess],
  exports: [RequestsService, RequestTransitionsService, RequestOwnershipService],
})
export class RequestsModule {}
