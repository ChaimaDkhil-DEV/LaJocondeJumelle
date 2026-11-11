import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { File as StoredFile } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { StandaloneFileAccess } from '../files/file-access';
import { FilesService } from '../files/files.service';
import { ConversationsService } from './conversations.service';

/** Vocaux des communications (015, 017 FR-024) : servis aux seuls lecteurs du message qui les porte. */
@Injectable()
export class CommunicationFileAccess implements StandaloneFileAccess, OnModuleInit {
  constructor(
    private readonly files: FilesService,
    private readonly conversations: ConversationsService,
  ) {}

  onModuleInit(): void {
    this.files.registerStandaloneAccess(this);
  }

  canRead(user: AuthenticatedUser, file: StoredFile): Promise<boolean | null> {
    if (file.kind !== 'VOICE') return Promise.resolve(null);
    return this.conversations.canReadVoice(user, file.id);
  }
}
