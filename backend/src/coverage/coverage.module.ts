import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { CoverageAccessLoader } from './coverage-access.loader';
import { CoverageActionsService } from './coverage-actions.service';
import { CoverageAdminController, FloorsAdminController } from './coverage-admin.controller';
import { CoverageAdminService } from './coverage-admin.service';
import { CoverageController } from './coverage.controller';
import { CoverageAnonymizationService } from './coverage-anonymization.service';
import { CoverageDeclarationsService } from './coverage-declarations.service';
import { CoverageStatsService } from './coverage-stats.service';
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
    CoverageStatsService,
    CoverageAnonymizationService,
    CoverageAdminService,
    CoverageAccessLoader,
    CoverageFileAccess,
  ],
  exports: [CoverageActionsService, CoverageAnonymizationService],
})
export class CoverageModule {}
