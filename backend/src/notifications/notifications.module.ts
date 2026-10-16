import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_PUBLISHER, NotificationsService } from './notifications.service';
import { SocketNotificationPublisher } from './socket-notification.publisher';
import { SuperAdminAlertsService } from './super-admin-alerts.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SuperAdminAlertsService,
    { provide: NOTIFICATION_PUBLISHER, useClass: SocketNotificationPublisher },
  ],
  exports: [NotificationsService, SuperAdminAlertsService],
})
export class NotificationsModule {}
