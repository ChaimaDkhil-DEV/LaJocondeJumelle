import { Module } from '@nestjs/common';
import { CoverageAccessLoader } from '../coverage/coverage-access.loader';
import { RequestPolicyLoader } from '../requests/request-policy.loader';
import { FileStorageService } from './file-storage.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FileStorageService, RequestPolicyLoader, CoverageAccessLoader],
  exports: [FilesService, FileStorageService],
})
export class FilesModule {}
