/** Constantes de la pile de démo (ports propres, mot de passe commun des comptes fictifs). */
export const DEMO_PASSWORD = 'MotDePasse-Demo-2026!';
export const PORTS = { db: 55435, api: 3200, web: 5175 } as const;
export const BASE_URL = `http://localhost:${PORTS.web}`;
