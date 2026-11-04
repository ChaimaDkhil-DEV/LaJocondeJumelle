import { t } from '../../i18n';
import type { Role } from '../../api/types';
import type { AssignmentMode, CategoryKind, Circuit, ClosureMode, ProofMode, RoutingMode } from './api';

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: t('Employé'),
  ADMIN: t('Admin'),
  SUPER_ADMIN: t('Super administrateur'),
};

export const CIRCUIT_LABELS: Record<Circuit, string> = {
  A_DIRECT: t('Circuit A : direct'),
  B_ADMIN_VALIDATION: t('Circuit B : validation administrative'),
};

export const ROUTING_LABELS: Record<RoutingMode, string> = {
  VIA_ADMIN: t('Via l’administration (avec approbation)'),
  DIRECT: t('Direct vers le service concerné'),
  PEER: t('Entre enseignants'),
};

/** Ce que chaque mode implique, affiché sous le choix. */
export const ROUTING_HINTS: Record<RoutingMode, string> = {
  VIA_ADMIN: t('L’administration confirme ou refuse la demande, puis l’affecte. En attendant, seuls le demandeur et l’administration la voient.'),
  DIRECT: t('La demande part directement au service (destinataires). L’administration la consulte sans action à faire.'),
  PEER: t('Un enseignant écrit directement à un collègue choisi parmi les destinataires. L’administration consulte sans action à faire.'),
};

export const CLOSURE_LABELS: Record<ClosureMode, string> = {
  AUTO: t('Automatique après un délai'),
  REQUESTER: t('Par le demandeur'),
  MANAGER: t('Par un admin'),
};

export const KIND_LABELS: Record<CategoryKind, string> = {
  WORK: t('Demandes de travail'),
  COVERAGE: t('Couverture de classe (garde, remplacement)'),
};

export const PROOF_MODE_LABELS: Record<ProofMode, string> = {
  PHOTO: t('Photo de la classe'),
  QR: t('QR code de la classe'),
  BOTH: t('QR code et photo'),
};

export const ASSIGNMENT_LABELS: Record<AssignmentMode, string> = {
  MANUAL: t('Choisie par un admin'),
  AUTO: t('Automatique vers un employé désigné'),
};

export const PERMISSION_LABELS: Record<string, string> = {
  REQUEST_CREATE: t('Créer une demande'),
  PRIORITY_CHANGE_OWN: t('Changer la priorité de ses demandes'),
  PRIORITY_CHANGE_MANAGED: t('Changer la priorité des demandes gérées'),
  REQUEST_REASSIGN: t('Réaffecter une demande'),
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: t('Connexion'),
  LOGIN_FAILURE: t('Échec de connexion'),
  LOGOUT: t('Déconnexion'),
  ACCESS_DENIED: t('Accès refusé'),
  USER_CREATED: t('Compte créé'),
  USER_UPDATED: t('Compte modifié'),
  USER_DEACTIVATED: t('Compte désactivé'),
  PASSWORD_RESET: t('Mot de passe réinitialisé'),
  PASSWORD_CHANGED: t('Mot de passe changé'),
  ROLE_PERMISSIONS_CHANGED: t('Permissions modifiées'),
  CATEGORY_CHANGED: t('Catégorie modifiée'),
  DEADLINE_RULE_CHANGED: t('Délais modifiés'),
  SETTING_CHANGED: t('Réglage modifié'),
  GROUP_CHANGED: t('Groupe d’employés modifié'),
  CLASS_CHANGED: t('Classe modifiée'),
  QR_REVOKED: t('QR code révoqué'),
  AVAILABILITY_CHANGED: t('Disponibilité modifiée'),
  COVERAGE_MANAGED: t('Affectation gérée par un admin'),
  COVERAGE_CREATED: t('Affectation créée'),
  REQUEST_MANAGED: t('Demande de travail gérée'),
  FLOOR_CHANGED: t('Étage modifié'),
  COVERAGE_ANONYMIZED: t('Affectations anonymisées'),
  COVERAGE_MERGE_DECIDED: t('Doublon tranché'),
  COVERAGE_STATS_EXPORTED: t('Export des statistiques des affectations'),
  GUIDELINE_CHANGED: t('Consigne créée / modifiée / supprimée'),
  STUDENT_CHANGED: t('Élève créé / modifié'),
};

const GUIDELINE_ACTION_LABELS: Record<string, string> = {
  CREATED: t('Consigne créée'),
  UPDATED: t('Consigne modifiée'),
  DELETED: t('Consigne supprimée'),
};

/** Libellé d'une entrée du journal ; une consigne est précisée par son action et son titre (spec 009). */
export function auditEntryLabel(action: string, details: Record<string, unknown> | null): string {
  if (action === 'GUIDELINE_CHANGED') {
    const label = GUIDELINE_ACTION_LABELS[String(details?.action)] ?? AUDIT_ACTION_LABELS[action]!;
    return typeof details?.title === 'string' ? t('{label} : {title}', { label, title: details.title }) : label;
  }
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Durée en minutes, lisible (« 1 h 30 », « 2 j »). */
export function formatMinutes(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days && t('{days} j', { days }), hours && t('{hours} h', { hours }), rest && t('{rest} min', { rest })].filter(Boolean).join(' ') || t('0 min');
}
