import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { CommunicationFileAccess } from './communication-file-access';
import { GuardiansService } from './guardians.service';
import {
  GuardiansController,
  ParentMessagesController,
  TeacherCommunicationsController,
  ValidationCommunicationsController,
} from './parent-communications.controller';
import {
  CommunicationTeacherGuard,
  CommunicationValidatorGuard,
} from './parent-communications.guards';
import { ParentCommunicationsService } from './parent-communications.service';

/** Communication enseignant / parents (015) : brouillons, validation, espace parent, représentants. */
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [
    TeacherCommunicationsController,
    ValidationCommunicationsController,
    ParentMessagesController,
    GuardiansController,
  ],
  providers: [
    ParentCommunicationsService,
    GuardiansService,
    CommunicationFileAccess,
    CommunicationTeacherGuard,
    CommunicationValidatorGuard,
  ],
  exports: [ParentCommunicationsService],
})
export class ParentCommunicationsModule {}
