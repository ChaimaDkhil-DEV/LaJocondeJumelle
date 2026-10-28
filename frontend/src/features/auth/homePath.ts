import type { Role } from '../../api/types';

/** Tableau de bord de l'espace Administrateur (`adminRoutes`). */
export const ADMIN_DASHBOARD_PATH = '/admin/tableau-de-bord';

/**
 * Page ouverte après la connexion : le tableau de bord de l'administration pour le super
 * administrateur, la liste des demandes pour les autres rôles. Une page précise demandée avant la
 * connexion (lien de notification, QR code) reste prioritaire ; la racine n'en est pas une.
 */
export function homePathFor(role: Role, requested?: string): string {
  if (requested && requested !== '/') return requested;
  return role === 'SUPER_ADMIN' ? ADMIN_DASHBOARD_PATH : '/';
}
