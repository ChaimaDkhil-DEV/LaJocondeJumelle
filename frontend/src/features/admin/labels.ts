import type { Role } from '../../api/types';
import type { AssignmentMode, CategoryKind, Circuit, ClosureMode, ProofMode, RoutingMode } from './api';

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employé',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super administrateur',
};

export const CIRCUIT_LABELS: Record<Circuit, string> = {
  A_DIRECT: 'Circuit A : direct',
  B_ADMIN_VALIDATION: 'Circuit B : validation administrative',
};

export const ROUTING_LABELS: Record<RoutingMode, string> = {
  VIA_ADMIN: 'Via l’administration (avec approbation)',
  DIRECT: 'Direct vers le service concerné',
  PEER: 'Entre enseignants',
};

/** Ce que chaque mode implique, affiché sous le choix. */
export const ROUTING_HINTS: Record<RoutingMode, string> = {
  VIA_ADMIN: 'L’administration confirme ou refuse la demande, puis l’affecte. En attendant, seuls le demandeur et l’administration la voient.',
  DIRECT: 'La demande part directement au service (destinataires). L’administration la consulte sans action à faire.',
  PEER: 'Un enseignant écrit directement à un collègue choisi parmi les destinataires. L’administration consulte sans action à faire.',
};

export const CLOSURE_LABELS: Record<ClosureMode, string> = {
  AUTO: 'Automatique après un délai',
  REQUESTER: 'Par le demandeur',
  MANAGER: 'Par un responsable',
};

export const KIND_LABELS: Record<CategoryKind, string> = {
  WORK: 'Demandes de travail',
  COVERAGE: 'Couverture de classe (garde, remplacement)',
};

export const PROOF_MODE_LABELS: Record<ProofMode, string> = {
  PHOTO: 'Photo de la classe',
  QR: 'QR code de la classe',
  BOTH: 'QR code et photo',
};

export const ASSIGNMENT_LABELS: Record<AssignmentMode, string> = {
  MANUAL: 'Choisie par le responsable',
  AUTO: 'Automatique vers un employé désigné',
};

export const PERMISSION_LABELS: Record<string, string> = {
  REQUEST_CREATE: 'Créer une demande',
  PRIORITY_CHANGE_OWN: 'Changer la priorité de ses demandes',
  PRIORITY_CHANGE_MANAGED: 'Changer la priorité des demandes gérées',
  REQUEST_REASSIGN: 'Réaffecter une demande',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Connexion',
  LOGIN_FAILURE: 'Échec de connexion',
  LOGOUT: 'Déconnexion',
  ACCESS_DENIED: 'Accès refusé',
  USER_CREATED: 'Compte créé',
  USER_UPDATED: 'Compte modifié',
  USER_DEACTIVATED: 'Compte désactivé',
  PASSWORD_RESET: 'Mot de passe réinitialisé',
  PASSWORD_CHANGED: 'Mot de passe changé',
  ROLE_PERMISSIONS_CHANGED: 'Permissions modifiées',
  CATEGORY_CHANGED: 'Catégorie modifiée',
  DEADLINE_RULE_CHANGED: 'Délais modifiés',
  SETTING_CHANGED: 'Réglage modifié',
  GROUP_CHANGED: 'Groupe d’employés modifié',
  CLASS_CHANGED: 'Classe modifiée',
  QR_REVOKED: 'QR code révoqué',
  AVAILABILITY_CHANGED: 'Disponibilité modifiée',
  COVERAGE_MANAGED: 'Garde gérée par un responsable',
  COVERAGE_CREATED: 'Garde créée',
  REQUEST_MANAGED: 'Demande de travail gérée',
};

/** Durée en minutes, lisible (« 1 h 30 », « 2 j »). */
export function formatMinutes(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days && `${days} j`, hours && `${hours} h`, rest && `${rest} min`].filter(Boolean).join(' ') || '0 min';
}
