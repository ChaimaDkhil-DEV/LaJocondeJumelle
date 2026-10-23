# Quickstart : vérifier l'export des statistiques des affectations

Prérequis : base de développement locale (`localhost:5433`) migrée jusqu'à
`0010_audit_coverage_stats_export` (`npm exec -w backend -- prisma migrate status` : « Database
schema is up to date! ») ; données de démonstration avec des affectations sur le mois en cours ;
application lancée (`start.bat` ou `npm run dev`).

Automatique : `npm run -w backend test` (unitaires), `npm run -w backend test:integration`,
`npm run -w frontend test`, `npx playwright test e2e/a11y-responsive.spec.ts e2e/coverage-stats-export.spec.ts`.

## Scénario 1 — Export par enseignant (US1, FR-001 à FR-005, SC-001 à SC-003)

1. Connecté en `admin`, ouvrir Gardes › Statistiques ; garder la période par défaut.
2. Cliquer sur « Exporter (CSV) ».
3. Attendu : fichier `statistiques-affectations-enseignant-<du>-au-<au>.csv` ; ouvert dans un
   tableur, colonnes séparées, accents corrects ; chaque ligne, la ligne « Total de la période »,
   le taux et les doublons égaux à la page.

## Scénario 2 — Classe, semaine, mois (US1 scénarios 3 et 4)

Refaire le scénario 1 avec « Classe », puis « Période › Semaine », puis « Période › Mois » :
nom du fichier et lignes conformes à la page.

## Scénario 3 — Enseignant anonymisé et formule (US1 scénarios 5 et 6)

Avec une affectation anonymisée et un enseignant dont le nom commence par « = » : le fichier
porte « Enseignant anonymisé » et le nom s'affiche en texte, sans formule exécutée.

## Scénario 4 — Accès et période invalide (US2 scénarios 1 et 2)

1. En `surveillant`, ouvrir `/api/coverage/stats/export.csv` : réponse « introuvable » ; entrée
   « Accès refusé » au journal d'audit.
2. En `admin`, ouvrir `/api/coverage/stats/export.csv?from=2026-10-23&to=2026-10-01` : erreur
   « période invalide », aucun fichier, aucune entrée d'export.

## Scénario 5 — États de la page (US2 scénarios 3 et 4)

1. Effacer la date « Au » : le bouton disparaît ; la remettre : il revient après le calcul.
2. Choisir une période sans affectation : bouton présent ; fichier avec totaux à zéro.

## Scénario 6 — Journal d'audit (US2 scénario 5, FR-009)

En `superadmin`, Administrateur › Journal d'audit, filtre « Export des statistiques des
affectations » : une entrée par export des scénarios précédents, avec l'auteur, la date, la
période et le regroupement, sans valeur ni nom.

## Scénario 7 — Accessibilité (FR-010, SC-005)

À 320 px : bouton visible sans défilement horizontal, atteint et activé au clavier, focus visible.
