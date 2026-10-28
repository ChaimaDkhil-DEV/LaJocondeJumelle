# Vérification de la fonctionnalité 009 — assistance IA à la création des demandes (socle)

Spécification, plan et tâches : `specs/009-assistance-ia-demandes/`.

## État initial (T001)

Branche `009-assistance-ia-demandes`, créée depuis `master` (`3124e78`, fusion de la PR #34).
Suites relancées le 27/10/2026, avant toute modification de code :

| Étape | Résultat |
|-------|----------|
| Typage backend (`tsc --noEmit`) | sans erreur |
| Tests unitaires backend | 608 / 608 (32 suites) |
| Tests d'intégration backend | 642 / 642 (45 suites) |
| Typage frontend (`tsc -b --noEmit`) | sans erreur |
| Tests frontend (Vitest) | 288 / 288 (37 fichiers) |

## Vérification finale (T042)

Suites relancées le 28/10/2026 sur la branche `009-assistance-ia-demandes`, après T018 à T041.
Résultats réels :

| Étape | Commande | Résultat | Avant (T001) |
|-------|----------|----------|--------------|
| Typage backend | `npm run -w backend typecheck` | sans erreur | sans erreur |
| Tests unitaires backend | `npm test -w backend` | 661 / 661 (36 suites) | 608 / 608 (32) |
| Tests d'intégration backend | `npm run -w backend test:integration` | 687 / 687 (49 suites) | 642 / 642 (45) |
| Typage frontend | `npm run -w frontend typecheck` | sans erreur | sans erreur |
| Tests frontend (Vitest) | `npm test -w frontend` | 317 / 317 (40 fichiers) | 288 / 288 (37) |
| E2E assistance | `npx playwright test -c e2e/playwright.config.ts assist.spec.ts` | chromium, mobile-320, firefox, webkit : 8 / 8 | — |
| E2E 320 px et clavier (009) | `a11y-responsive.spec.ts`, scénario « 009 » | mobile-320 : réussi, sans défilement horizontal ni violation axe | — |
| E2E existants touchant la création | `us1-create-voice-request`, `drafts`, `a11y-responsive`, `us8-admin` (chromium, mobile-320) | 15 réussis, 7 ignorés (scénarios propres à un autre profil) | — |

Nouveaux tests : `assist-suggestions.spec.ts` (propositions, droits, réponses non fiables,
désactivation, délai, limite d'appels, journal sans le texte), `assist-transcriptions.spec.ts`
(aucun fichier ni ligne `File` conservés), `requests-create.spec.ts` (événement
`ASSIST_SUGGESTED`, jeton invalide, expiré ou d'un autre utilisateur, brouillon, renvoi, circuit B,
catégorie désactivée), `frontend/tests/admin/guidelines.test.tsx`,
`frontend/tests/assist/assist-panel.test.tsx`, `frontend/tests/requests/history-assist.test.tsx`,
`e2e/assist.spec.ts`.

### Écarts et limites

- **Aucun fournisseur réel** : `disabled` par défaut, `demo` (local, déterministe, refusé en
  production). Les propositions de démonstration repèrent des mots des consignes et des noms de
  catégories ; elles prouvent le parcours, pas la qualité d'un modèle. Brancher un fournisseur
  réel exige une décision de l'établissement (accord de traitement, conservation) et une mise à
  jour de la spécification.
- **Transcription de démonstration** : texte fixe (`ASSIST_DEMO_TRANSCRIPT`), quel que soit le vocal.
- **Recherche par mots** (plein texte PostgreSQL en français), pas de recherche sémantique
  (pgvector écarté : research R5).
- **Pas de score de confiance** (FR-004) ; le titre proposé fait office de résumé.
- **Limite d'appels en mémoire** : valable pour une seule instance de l'API (déploiement actuel).
- Hors périmètre : gardes (couverture de classe) et reprise d'un brouillon.
- La suite E2E complète (tous fichiers, tous navigateurs) n'a pas été relancée : seuls les
  fichiers ci-dessus l'ont été.
