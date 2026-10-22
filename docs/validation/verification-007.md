# Vérification de la fonctionnalité 007 — brouillons de demande de travail

Spécification, plan et tâches : `specs/007-brouillons-demandes/`.

## État initial (T001)

Branche `007-brouillons-demandes`, créée depuis `master` (`c0f16fb`, fusion de la PR #25). Depuis
la vérification finale de la 006 (`f753270`), seul `.github/workflows/ci.yml` a changé (plafond de
5 minutes sur ffmpeg) ; aucun fichier de `backend/`, `frontend/`, `e2e/` ni des dépendances.

| Étape | Résultat (vérification finale 006, `verification-006.md`) |
|-------|----------|
| CI sur `c0f16fb` | verte |
| Tests unitaires backend | 585 / 585 |
| Tests d'intégration backend | 623 / 623 |
| Tests frontend (Vitest) | 262 / 262 |
| Bout en bout (6 profils) | 146 réussis, 0 échec, 88 ignorés volontairement |

## Scénarios du quickstart (T020)

| # | Scénario | Couverture automatique | Reste à faire à la main |
|---|----------|------------------------|-------------------------|
| 1 | Enregistrer en brouillon (US1, FR-001 à FR-003) | `drafts.test.tsx` (« Enregistrer en brouillon » : `asDraft`, priorité « Normale », vocal téléversé d'abord) ; `requests-drafts.spec.ts` (aucune notification) ; `e2e/drafts.spec.ts` (le destinataire ne voit rien) | — |
| 2 | Validation réduite (US1 scénario 2) | `drafts.test.tsx` (« validation réduite ») | — |
| 3 | Onglet (US2, FR-004, FR-004b) | `drafts.test.tsx` (onglet absent, présent après « Envoyées », lien vers la reprise) ; `requests-drafts.spec.ts` (`scope=drafts`, `scope=mine` sans brouillon) ; `e2e/drafts.spec.ts` | — |
| 4 | Reprendre et envoyer (US2, FR-005 à FR-007, SC-003) | `drafts.test.tsx` (pré-remplissage, champs changés seuls, `SUBMIT` avec la version) ; `requests-drafts.spec.ts` (statut et notifications d'une création directe, deux circuits) ; `e2e/drafts.spec.ts` (parcours complet, destinataire notifié) | Réécoute du vocal sur un vrai téléphone (comme T119) |
| 5 | Envoi incomplet (US2 scénario 4) | `drafts.test.tsx` ; `requests-drafts.spec.ts` (refus serveur, brouillon conservé) | — |
| 6 | Supprimer (US3) | `drafts.test.tsx` (annuler, confirmer) ; `e2e/drafts.spec.ts` | — |
| 7 | Réglage désactivé (FR-001, FR-008) | `drafts.test.tsx` (bouton absent) ; `requests-drafts.spec.ts` (création refusée, modification, envoi et suppression permis) | Bascule du réglage dans « Réglages » puis retour sur « Nouvelle demande » |
| 8 | Accessibilité (FR-010, SC-005) | `a11y-responsive.spec.ts` (test « 007 », 320 px : enregistrement au clavier, page brouillon, onglet, dialogue de suppression, axe) ; écran « création » du test V18 avec le nouveau bouton | Lecteur d'écran (NVDA) sur la page brouillon |

Écart avec le plan : sur mobile, les boutons sont empilés dans l'ordre du document (pas d'inversion
visuelle), pour que l'ordre du clavier suive l'ordre affiché (WCAG 2.4.3).

## Vérification finale (T021)

Le 22/10/2026, sorties conservées.

| Étape | Avant (006) | Après (007) |
|-------|-------------|-------------|
| `npm run lint` | sans erreur | sans erreur (après correction d'un motif vide dans `e2e/drafts.spec.ts`, signalé au premier passage) |
| Tests unitaires backend | 585 / 585 | **585 / 585** |
| Tests d'intégration backend | 623 / 623 | **630 / 630** (+7 : `requests-drafts.spec.ts`) |
| Tests frontend (Vitest) | 262 / 262 | **282 / 282** (+20 : `drafts.test.tsx`) |
| Typecheck backend et frontend | sans erreur | sans erreur |
| `npm audit --audit-level=high` | aucune vulnérabilité élevée (21 modérées) | aucune vulnérabilité élevée ; **2 modérées** (`js-yaml` via `@nestjs/swagger`, correctif = passage cassant à `@nestjs/swagger` 12 ; base d'avis changée, aucune dépendance modifiée par la 007) |
| Bout en bout (6 profils, 252 tests) | 146 réussis, 88 ignorés | **138 réussis, 0 échec, 114 ignorés volontairement** (36,3 min) |

Les 114 ignorés : les 88 habituels (scénarios réservés à un profil), les 15 nouveaux hors de leur
profil (`drafts.spec.ts` hors Chromium : 10 ; test 007 de `a11y-responsive` hors `mobile-320` : 5),
et **11 gardes horaires** : la campagne a tourné vers 22 h 15 heure de l'école (l'horloge de la
machine est en UTC+1, Paris en UTC+2 jusqu'au 25/10), ce qui ignore les 9 parcours d'affectation
(A, B, C à 360, 768 et 1 280 px, après 22 h) et les 2 de la spec 006 (après 20 h). Ils ne touchent
pas au code de la 007 ; ils étaient verts à la vérification de la 006 et le restent en CI.

Nouveaux tests e2e réussis : les deux parcours de `drafts.spec.ts` (Chromium) et le test 007 de
`a11y-responsive.spec.ts` (320 px : enregistrement au clavier, page brouillon, onglet, dialogue de
suppression, axe).

Restent : CI verte sur la branche, puis fusion selon `docs/procedure-fusion.md`.
