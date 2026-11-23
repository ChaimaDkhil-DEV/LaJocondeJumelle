import { t } from '../../i18n';

/** Ce qui distingue le point de vue de la personne sur la section des gardes (`/gardes`). */
export interface SectionRoles {
  isTeacher?: boolean;
  isSupervisor?: boolean;
  /** Administration : affecte les surveillants et suit chaque affectation. */
  canManage?: boolean;
}

/**
 * Nom de la section des gardes : « Mon assiduité » pour un enseignant qui n'est ni surveillant ni gestionnaire (il n'y
 * voit que ses propres signalements et présences), « Surveillance » pour tous les autres. L'adresse ne change pas :
 * les QR codes imprimés pointent vers `/gardes/presence`.
 */
export function sectionNameFor(roles: SectionRoles): string {
  return roles.isTeacher && !roles.isSupervisor && !roles.canManage ? t('Mon assiduité') : t('Surveillance');
}
