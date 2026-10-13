import { Module } from '@nestjs/common';
import { RequestPolicyLoader } from '../requests/request-policy.loader';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, RequestPolicyLoader],
})
export class MessagesModule {}
