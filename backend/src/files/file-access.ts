import type { Request, File as StoredFile } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Décision d'accès aux fichiers d'un type de demande (R8, FR-014). Chaque domaine fournit la
 * sienne et l'enregistre auprès de FilesService : le stockage ne connaît aucune règle métier.
 */
export interface RequestFileAccess {
  /** Fichier rattaché à `request` lisible par `user`. */
  canRead(user: AuthenticatedUser, file: StoredFile, request: Request): Promise<boolean>;
  /** `user` peut joindre un fichier à `request` au téléversement. */
  canAttach(user: AuthenticatedUser, request: Request): Promise<boolean>;
}
