import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PUSH_SCHEDULER, PushDispatcher, timerScheduler } from './push-dispatcher.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PUSH_SENDER, WebPushSender } from './web-push.sender';

/**
 * Notifications push (spec 014). N'importe ni NotificationsModule ni AuthModule : c'est
 * NotificationsModule qui l'importe (dépendances de modules, plan.md). Utilise les modules globaux
 * (configuration, réglages, audit, Prisma).
 */
@Module({
  controllers: [PushController],
  providers: [
    PushDispatcher,
    PushSubscriptionsService,
    { provide: PUSH_SENDER, useClass: WebPushSender },
    { provide: PUSH_SCHEDULER, useValue: timerScheduler },
  ],
  exports: [PushDispatcher, PushSubscriptionsService],
})
export class PushModule {}
