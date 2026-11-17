import { Module } from '@nestjs/common';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { RequestsModule } from '../requests/requests.module';
import { AdminRequestsController } from './admin-requests.controller';
import { AdminTransfersController } from './admin-transfers.controller';
import { SuperAdminController } from './super-admin.controller';
import { SupervisionService } from './supervision.service';
import { TransfersService } from './transfers.service';
import { WorkspaceService } from './workspace.service';

/**
 * Responsable administratif des demandes et transferts entre administrateurs (018). Module à part,
 * placé après requests/ dans l'ordre des couches : il s'appuie sur les demandes, jamais l'inverse.
 */
@Module({
  imports: [RequestsModule, RequestPolicyModule],
  controllers: [AdminRequestsController, AdminTransfersController, SuperAdminController],
  providers: [WorkspaceService, TransfersService, SupervisionService],
  exports: [TransfersService],
})
export class TransfersModule {}
