import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request, File as StoredFile } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import type { RequestFileAccess } from '../files/file-access';
import { FilesService } from '../files/files.service';
import { RequestPolicyLoader } from '../requests/request-policy.loader';
import { CoverageAccessLoader } from './coverage-access.loader';
import { canReadPresenceProof, coverageAccess } from './domain/coverage-policy';

/**
 * Fichiers des couvertures de classe (R8) : la photo de preuve n'est lisible que par son auteur,
 * les responsables et le super administrateur ; les autres fichiers suivent l'accès complet.
 */
@Injectable()
export class CoverageFileAccess implements RequestFileAccess, OnModuleInit {
  constructor(
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageAccessLoader,
    private readonly policies: RequestPolicyLoader,
  ) {}

  onModuleInit(): void {
    this.files.registerAccess('COVERAGE', this);
  }

  async canRead(user: AuthenticatedUser, file: StoredFile, request: Request): Promise<boolean> {
    if (!(await this.policies.category(request.categoryId))) return false;
    const facts = await this.coverage.facts(request, user.id);
    if (!facts) return false;
    const isProof = file.isCompletionProof || (await this.prisma.coveragePresence.count({ where: { fileId: file.id } })) > 0;
    if (isProof) return canReadPresenceProof(user, facts, file.uploaderId);
    return coverageAccess(user, facts) === 'full';
  }

  /**
   * Comportement conservé : le téléversement rattaché appliquait la règle des demandes de
   * travail (canWriteInThread), qui refuse toute couverture. Les preuves sont rattachées par
   * les actions de la couverture, pas au téléversement.
   */
  async canAttach(): Promise<boolean> {
    return false;
  }
}
