import { Global, Module } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import { AdminAuditController } from './admin-audit.controller';
import { AuditService } from './audit.service';

@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [AuditService, SuperAdminGuard],
  exports: [AuditService],
})
export class AuditModule {}
