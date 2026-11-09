import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { File as StoredFile } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { StandaloneFileAccess } from '../files/file-access';
import { FilesService } from '../files/files.service';
import { ParentCommunicationsService } from './parent-communications.service';

/** Vocaux des communications aux parents (015, FR-006) : la décision revient à ce domaine. */
@Injectable()
export class CommunicationFileAccess implements StandaloneFileAccess, OnModuleInit {
  constructor(
    private readonly files: FilesService,
    private readonly communications: ParentCommunicationsService,
  ) {}

  onModuleInit(): void {
    this.files.registerStandaloneAccess(this);
  }

  canRead(user: AuthenticatedUser, file: StoredFile): Promise<boolean | null> {
    if (file.kind !== 'VOICE') return Promise.resolve(null);
    return this.communications.canReadVoice(user, file.id, file.uploaderId);
  }
}
