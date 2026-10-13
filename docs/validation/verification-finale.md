# Vérification finale du Lot 1 (T121)

- **Date** : 13 octobre 2026
- **Branche** : `001-demandes-travail-vocales`
- **Poste** : Windows 11, Node.js 24.21, PostgreSQL 17 embarqué (embedded-postgres), ffmpeg local

## `npm run verify`

Code de sortie 0.

| Étape | Résultat |
|-------|----------|
| Lint (ESLint, dont jsx-a11y) | aucun problème |
| Tests unitaires backend | 321 / 321 |
| Tests d'intégration backend (API + PostgreSQL) | 205 / 205 |
| Tests frontend (Vitest) | 107 / 107 |
| `npm audit --audit-level=high` | aucune vulnérabilité élevée ou critique (21 modérées, outillage de développement) |

## Bout en bout (`npm run test:e2e`)

6 profils : Chromium, Firefox, WebKit, iPhone 13, Pixel 7, 320 px.
**127 réussis, 0 échec, 23 ignorés volontairement** :

- 9 tests réservés à un seul profil, car ils modifient un compte partagé ou dépendent de délais
  réels : changement de mot de passe imposé (compte `nouveau`) et V14 (délais).
- 10 tests V18 réservés au profil 320 px ; 4 mesures SC-001 réservées aux profils téléphone.

## Scénarios du quickstart

| # | Scénario | Preuve automatisée | Résultat |
|---|----------|--------------------|----------|
| V1 | Demande vocale | `e2e/us1-create-voice-request.spec.ts` | ✅ |
| V2 | Destinataire hors catégorie | `backend/test/integration/requests-create.spec.ts` | ✅ |
| V3 | Échec d'envoi, renvoi | `e2e/us1-…`, `requests-create.spec.ts` | ✅ |
| V4 | Micro refusé | `e2e/us1-create-voice-request.spec.ts` | ✅ |
| V5 | Traitement circuit A | `e2e/us2-process-request.spec.ts` | ✅ |
| V6 | Photo obligatoire | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V7 | Refus par l'affecté | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V8 | Annulation | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V9 | Transitions concurrentes | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V10 | Fil de discussion | `e2e/us3-thread.spec.ts` | ✅ |
| V11 | Fichier interdit | `e2e/us3-…`, `messages.spec.ts` | ✅ |
| V12 | Notifications temps réel | `e2e/us4-notifications.spec.ts` | ✅ |
| V13 | Circuit B | `e2e/us5-admin-validation.spec.ts`, `requests-circuit-b.spec.ts` | ✅ |
| V14 | Délais et retards | `e2e/us6-deadlines.spec.ts`, `overdue-job.spec.ts` | ✅ |
| V15 | Recherche et historique | `e2e/us7-search-history.spec.ts` | ✅ |
| V16 | Administration | `e2e/us8-admin.spec.ts`, `admin-*.spec.ts` | ✅ |
| V17 | Audit non modifiable | `backend/test/integration/append-only.spec.ts` | ✅ |
| V18 | Accessibilité, 320 px, clavier | `e2e/a11y-responsive.spec.ts` | ✅ |

**SC-001** (`e2e/sc001-create-timing.spec.ts`) : 14,7 s sur Pixel 7 et 16,5 s sur iPhone 13
(profil WebKit avec MediaRecorder simulé), enregistrement de 10 s compris ; limite 60 s.

**SC-009** (`search-performance.spec.ts`) : recherche filtrée sur 10 000 demandes en moins de 2 s.

## Configuration de production

- `deploy/Caddyfile` validé par `caddy validate` (Caddy 2.10).
- SPA de production servie par ce Caddyfile, avec ses en-têtes (CSP, Permissions-Policy, HSTS),
  devant l'API ; parcours Chromium sans aucune violation CSP ni erreur JavaScript : connexion,
  enregistrement et réécoute d'un vocal, envoi, lecture du vocal converti, temps réel (Socket.IO),
  administration.
- Syntaxe des scripts shell vérifiée (`bash -n`).
- **Non vérifié sur ce poste (Docker absent)** : construction des images, `docker compose up`,
  sauvegarde et restauration réelles. À faire sur la machine de recette avant la mise en
  production (voir le quickstart, « Test de restauration »).

## Restant avant la mise en production

- T119 : vérification manuelle sur un vrai iPhone — [iphone-manuel.md](iphone-manuel.md).
- T120 : test d'utilisabilité avec 5 employés (SC-002) — [test-utilisabilite-lot1.md](test-utilisabilite-lot1.md).
- Déploiement Docker et test de restauration sur la machine de recette.
- Validation par l'établissement des valeurs provisoires (durées de conservation, permissions,
  délais, destinataires) — voir le README.
