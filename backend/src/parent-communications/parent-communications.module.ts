import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { CommunicationFileAccess } from './communication-file-access';
import {
  AdminCommunicationsController,
  ParentMessagesController,
  TeacherCommunicationsController,
} from './communications.controller';
import { ConversationsService } from './conversations.service';
import { GuardiansService } from './guardians.service';
import { GuardiansController } from './parent-communications.controller';
import { CommunicationTeacherGuard, CommunicationValidatorGuard } from './parent-communications.guards';
import { ParentCommunicationsService } from './parent-communications.service';

/**
 * Communications (015, refondu par 017) : conversations INTERNAL (enseignant ↔ administration) et PARENT
 * (administration ↔ représentant), archives 015, validation des messages aux parents, représentants et
 * classes des enseignants.
 */
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [
    TeacherCommunicationsController,
    ParentMessagesController,
    AdminCommunicationsController,
    GuardiansController,
  ],
  providers: [
    ParentCommunicationsService,
    ConversationsService,
    GuardiansService,
    CommunicationFileAccess,
    CommunicationTeacherGuard,
    CommunicationValidatorGuard,
  ],
  exports: [ParentCommunicationsService],
})
export class ParentCommunicationsModule {}
