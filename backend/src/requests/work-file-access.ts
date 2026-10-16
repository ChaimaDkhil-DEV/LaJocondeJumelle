import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request, File as StoredFile } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { RequestFileAccess } from '../files/file-access';
import { FilesService } from '../files/files.service';
import { canReadRequest, canWriteInThread } from './domain/access-policy';
import { RequestPolicyLoader, toPolicyCategory, toPolicyRequest } from './request-policy.loader';

/** Fichiers des demandes de travail : mêmes droits que la demande parente (R8). */
@Injectable()
export class WorkFileAccess implements RequestFileAccess, OnModuleInit {
  constructor(
    private readonly files: FilesService,
    private readonly policies: RequestPolicyLoader,
  ) {}

  onModuleInit(): void {
    this.files.registerAccess('WORK', this);
  }

  async canRead(user: AuthenticatedUser, _file: StoredFile, request: Request): Promise<boolean> {
    const category = await this.policies.category(request.categoryId);
    return category !== null && canReadRequest(user, toPolicyRequest(request), toPolicyCategory(category));
  }

  async canAttach(user: AuthenticatedUser, request: Request): Promise<boolean> {
    const category = await this.policies.category(request.categoryId);
    return category !== null && canWriteInThread(user, toPolicyRequest(request), toPolicyCategory(category));
  }
}
