import { Global, Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { CompositeNotificationPublisher } from './composite-notification.publisher';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_PUBLISHER, NotificationsService } from './notifications.service';
import { SocketNotificationPublisher } from './socket-notification.publisher';
import { SuperAdminAlertsService } from './super-admin-alerts.service';

@Global()
@Module({
  // Le push (014) n'importe jamais ce module : sens unique Notifications → Push (plan.md).
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SuperAdminAlertsService,
    SocketNotificationPublisher,
    // Après validation de la transaction : Socket.IO, puis le push (014, research R2).
    { provide: NOTIFICATION_PUBLISHER, useClass: CompositeNotificationPublisher },
  ],
  exports: [NotificationsService, SuperAdminAlertsService],
})
export class NotificationsModule {}
