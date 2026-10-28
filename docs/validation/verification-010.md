# Vérification de la fonctionnalité 010 — connecteurs réels et demandes similaires

Spécification, plan et tâches : `specs/010-assistance-fournisseurs-similaires/`.

## État initial (T001)

Branche `010-assistance-fournisseurs-et-similaires`, créée depuis `master` (`7a55b83`, fusion de
#41). Référence : derniers résultats mesurés sur ce code le 28/10/2026 — lint et typages sans
erreur, unitaires backend 661 / 661, intégration 687 / 687 (avant #39 à #41, sans changement
backend depuis), frontend 325 / 325. Le relevé lancé au début de ce lot n'est pas retenu : il
incluait déjà les nouveaux tests écrits en parallèle.

## Dépendance ajoutée (T002)

`@anthropic-ai/sdk` 1.3.0 (backend), SDK officiel imposé par la référence de l'API pour un projet
TypeScript. `npm audit --audit-level=high` : 16 vulnérabilités avant comme après l'ajout (aucune
dans ce paquet) ; les 4 « high » existantes (`multer`, `body-parser`, `undici`) sont antérieures et
font échouer l'étape `npm audit` de la CI depuis fin octobre.

## Vérification finale (T019)

Le 28/10/2026, résultats réels :

| Étape | Commande | Résultat |
|-------|----------|----------|
| Lint | `npm run lint` | sans erreur |
| Typage backend et frontend | `npm run -w backend typecheck`, `npm run -w frontend typecheck` | sans erreur |
| Unitaires backend | `npm test -w backend` | 679 / 679 (38 suites ; +18 : configuration, Whisper, Claude, contrôle) |
| Intégration backend | `npm run -w backend test:integration` | 693 / 693 (50 suites ; +6 : demandes similaires et droits) — voir « Écarts » |
| Frontend (Vitest) | `npm test -w frontend` | 328 / 328 (+3 : section, absence, transcription remplacée) |
| E2E assistance | `assist.spec.ts` (chromium, mobile-320) | 6 / 6, dont la demande similaire et l'audit axe |
| E2E 320 px et clavier | `a11y-responsive.spec.ts` (chromium, mobile-320) | 5 réussis, 5 ignorés volontairement |
| Dépendances | `npm audit --audit-level=high` | 4 « high » antérieures, aucune nouvelle |

### Écarts et limites

- **Intégration** : une première passe complète a compté 1 échec sur 693 ; deux relances complètes
  sont vertes (693 / 693). Le test en cause n'a pas été identifié (sortie filtrée) : à surveiller.
- **Test d'interface T007** écrit avant le code mais lancé seulement après : son état rouge n'a pas
  été observé. T016 passe sans modification de code (comportement déjà correct, désormais prouvé).
- **Connecteurs non essayés avec un vrai service** : vérifiés uniquement sur `fetch` et SDK simulés
  (aucun appel réseau, SC-004). Un essai réel exige la décision de l'établissement et une clé.
- **Repli serveur** `fallbacks: "default"` activé sur le connecteur Claude : en cas de refus de
  sécurité, la demande est rejouée sur un autre modèle Claude ; à désactiver si l'établissement le
  refuse.
- E2E Firefox, WebKit, iPhone 13 et Pixel 7 non relancés.
