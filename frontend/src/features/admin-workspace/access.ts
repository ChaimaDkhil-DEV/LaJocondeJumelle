import type { Me } from '../../api/types';

/**
 * Espace de travail (018) : comptes Admin. Le super administrateur supervise sans jamais être
 * responsable d'une demande ; il n'a donc pas d'espace de travail.
 */
export function hasWorkspace(me: Pick<Me, 'role'> | undefined): boolean {
  return me?.role === 'ADMIN';
}
