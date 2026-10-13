/** Comptes créés par le seed en mode e2e (SEED_E2E=1), tous avec le même mot de passe. */
export const E2E_PASSWORD = 'MotDePasse-E2E-2026!';

export const accounts = {
  superadmin: 'superadmin',
  responsable: 'responsable',
  enseignante: 'enseignante',
  reprographie: 'reprographie',
  /** Seul compte e2e devant changer son mot de passe à la première connexion. */
  nouveau: 'nouveau',
  /** Employé sans lien avec les demandes de test (confidentialité). */
  autre: 'autre',
  /** Couverture de classe : membres du groupe « Surveillants/Remplaçants ». */
  surveillant: 'surveillant',
  remplacant: 'remplacant',
} as const;

export type AccountName = keyof typeof accounts;
