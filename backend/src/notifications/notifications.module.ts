import { Global, Module } from '@nestjs/common';
import {
  NOTIFICATION_PUBLISHER,
  NoopNotificationPublisher,
  NotificationsService,
} from './notifications.service';

@Global()
@Module({
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_PUBLISHER, useClass: NoopNotificationPublisher },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
