import { Module } from '@nestjs/common';
import { PushDispatcher } from './push-dispatcher.service';
import { PUSH_SENDER, WebPushSender } from './web-push.sender';

/**
 * Notifications push (spec 014). N'importe ni NotificationsModule ni AuthModule : c'est
 * NotificationsModule qui l'importe (dépendances de modules, plan.md). Utilise les modules globaux
 * (configuration, réglages, audit, Prisma).
 */
@Module({
  providers: [PushDispatcher, { provide: PUSH_SENDER, useClass: WebPushSender }],
  exports: [PushDispatcher],
})
export class PushModule {}
