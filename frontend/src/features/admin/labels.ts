import type { Role } from '../../api/types';
import type { AssignmentMode, Circuit, ClosureMode } from './api';

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employé',
  MANAGER: 'Responsable',
  SUPER_ADMIN: 'Super administrateur',
};

export const CIRCUIT_LABELS: Record<Circuit, string> = {
  A_DIRECT: 'Circuit A : direct',
  B_ADMIN_VALIDATION: 'Circuit B : validation administrative',
};

export const CLOSURE_LABELS: Record<ClosureMode, string> = {
  AUTO: 'Automatique après un délai',
  REQUESTER: 'Par le demandeur',
  MANAGER: 'Par un responsable',
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
};

/** Durée en minutes, lisible (« 1 h 30 », « 2 j »). */
export function formatMinutes(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days && `${days} j`, hours && `${hours} h`, rest && `${rest} min`].filter(Boolean).join(' ') || '0 min';
}
