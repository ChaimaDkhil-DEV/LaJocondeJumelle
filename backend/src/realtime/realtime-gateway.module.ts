import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Passerelle Socket.IO, séparée du registre des connexions (RealtimeModule, global, sans
 * dépendance à l'authentification) : la passerelle authentifie avec SessionService (AuthModule).
 */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
