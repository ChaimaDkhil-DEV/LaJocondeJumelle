import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { CoverageAccessLoader } from './coverage-access.loader';
import { CoverageActionsService } from './coverage-actions.service';
import { CoverageAdminController, FloorsAdminController } from './coverage-admin.controller';
import { CoverageAdminService } from './coverage-admin.service';
import { CoverageController } from './coverage.controller';
import { CoverageDeclarationsService } from './coverage-declarations.service';
import { CoverageFileAccess } from './coverage-file-access';
import { CoverageService } from './coverage.service';

/** Affectations des surveillants (gardes enrichies, 004) et suivi par le super administrateur. */
@Module({
  imports: [FilesModule, RequestPolicyModule],
  controllers: [CoverageController, CoverageAdminController, FloorsAdminController],
  providers: [
    CoverageService,
    CoverageActionsService,
    CoverageDeclarationsService,
    CoverageAdminService,
    CoverageAccessLoader,
    CoverageFileAccess,
  ],
  exports: [CoverageActionsService],
})
export class CoverageModule {}
