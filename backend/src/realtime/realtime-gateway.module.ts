import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';

/** Séparé de RealtimeModule (global) pour éviter une dépendance circulaire avec AuthModule. */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
