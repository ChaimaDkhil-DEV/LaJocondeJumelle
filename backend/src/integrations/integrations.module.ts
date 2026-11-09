import { Module } from '@nestjs/common';
import { ParentCommunicationsModule } from '../parent-communications/parent-communications.module';
import { N8nController, N8nGuard } from './n8n.controller';
import { OutboxDispatcher } from './outbox-dispatcher.service';
import { OutboxJob } from './outbox.job';

/** Automatisations externes (015) : outbox vers n8n et routes appelées par n8n. */
@Module({
  imports: [ParentCommunicationsModule],
  controllers: [N8nController],
  providers: [OutboxDispatcher, OutboxJob, N8nGuard],
})
export class IntegrationsModule {}
