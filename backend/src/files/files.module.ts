import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FileStorageService],
  exports: [FilesService, FileStorageService],
})
export class FilesModule {}
