import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_PUBLISHER, NotificationsService } from './notifications.service';
import { SocketNotificationPublisher } from './socket-notification.publisher';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_PUBLISHER, useClass: SocketNotificationPublisher },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
