import { Module } from '@nestjs/common';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [RequestPolicyModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
