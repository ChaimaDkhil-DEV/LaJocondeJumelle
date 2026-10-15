import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { CoverageAccessLoader } from './coverage-access.loader';
import { CoverageActionsService } from './coverage-actions.service';
import { CoverageAdminController } from './coverage-admin.controller';
import { CoverageAdminService } from './coverage-admin.service';
import { CoverageController } from './coverage.controller';
import { CoverageFileAccess } from './coverage-file-access';
import { CoverageService } from './coverage.service';

/** Couverture de classe (garde / remplacement) et suivi des employés par le super administrateur. */
@Module({
  imports: [FilesModule, RequestPolicyModule],
  controllers: [CoverageController, CoverageAdminController],
  providers: [
    CoverageService,
    CoverageActionsService,
    CoverageAdminService,
    CoverageAccessLoader,
    CoverageFileAccess,
  ],
  exports: [CoverageActionsService],
})
export class CoverageModule {}
