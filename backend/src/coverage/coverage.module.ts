import { Module } from '@nestjs/common';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { CoverageAccessLoader } from './coverage-access.loader';
import { CoverageActionsService } from './coverage-actions.service';
import { CoverageAdminController } from './coverage-admin.controller';
import { CoverageAdminService } from './coverage-admin.service';
import { CoverageDeadlinesJob } from './coverage-deadlines.job';
import { CoverageController } from './coverage.controller';
import { CoverageService } from './coverage.service';

/** Couverture de classe (garde / remplacement) et suivi des employés par le super administrateur. */
@Module({
  imports: [RequestPolicyModule],
  controllers: [CoverageController, CoverageAdminController],
  providers: [
    CoverageService,
    CoverageActionsService,
    CoverageAdminService,
    CoverageAccessLoader,
    CoverageDeadlinesJob,
  ],
})
export class CoverageModule {}
