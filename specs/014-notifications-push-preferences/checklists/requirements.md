# Liste de contrôle de la spécification : Notifications push et préférences utilisateur

**Objet** : vérifier la complétude et la qualité de la spécification avant `/speckit-clarify` ou `/speckit-plan`
**Créée le** : 2026-11-09
**Fonctionnalité** : [spec.md](../spec.md)

## Qualité du contenu

- [ ] Aucun détail d'implémentation (langages, frameworks, API) — écart accepté, voir Notes
- [x] Centrée sur la valeur pour les utilisateurs et les besoins de l'établissement
- [x] Rédigée pour des lecteurs non techniques (hors sections Contexte et correspondance des types)
- [x] Toutes les sections obligatoires sont complétées

## Complétude des exigences

- [x] Aucun marqueur [NEEDS CLARIFICATION] restant — NC-1 à NC-10 tranchées le 2026-11-09 (section Clarifications)
- [x] Exigences testables et sans ambiguïté
- [x] Critères de succès mesurables
- [x] Critères de succès indépendants de la technique
- [x] Scénarios d'acceptation définis pour chaque user story
- [x] Cas limites identifiés
- [x] Périmètre clairement borné (section « Hors périmètre »)
- [x] Dépendances et hypothèses identifiées

## Préparation de la fonctionnalité

- [x] Chaque exigence fonctionnelle a des critères d'acceptation clairs (scénarios ou critères de succès)
- [x] Les user stories couvrent les parcours principaux
- [x] La fonctionnalité répond aux résultats mesurables des critères de succès
- [ ] Aucun détail d'implémentation ne fuit dans la spécification — écart accepté, voir Notes

## Vérifications demandées par l'utilisatrice

- [x] D1 à D10 représentées (D1 : correspondance + FR-004 ; D2 : US2, FR-002 ; D3 : Hors périmètre ; D4 : US1-5,
  FR-004 ; D5 : US3, FR-009, NC-6 ; D6 : US4, FR-010, Hypothèses (fuseau) ; D7 : FR-007, SC-006 ; D8 : US5, FR-011,
  FR-020, NC-3, NC-8 ; D9 : FR-013, NFR-002, Données personnelles ; D10 : US1-4, FR-015, Cas limites)
- [x] Exclusions respectées : pas de regroupement, d'escalade, d'e-mail, de modèle générique, de plage
  individuelle ni de push différé
- [x] Modèle `Notification` non modifié ; seules nouvelles données : abonnements d'appareils et préférences ; la
  plage horaire passe par les réglages existants
- [x] Identifiants FR-001 à FR-014 et SC-001 à SC-004 conservés ; ajouts FR-015 à FR-020, NFR-001 à NFR-006,
  SC-005 et SC-006 pour les exigences transversales demandées

## Notes

- **Détails techniques** : la spec nomme des types de notification, `SCHOOL_TIMEZONE`, Socket.IO, les clés VAPID,
  les codes 404/410/429/5xx et le protocole Web Push. C'est volontaire : ces éléments viennent des décisions
  validées (D8, D9) ou du constat de code demandé par l'utilisatrice, et la correspondance des types ne peut pas
  s'écrire autrement.
- **Nombre de marqueurs** : le gabarit Spec Kit en limite le nombre à 3 ; l'utilisatrice avait demandé de marquer
  chaque point non tranché plutôt que de supposer (9 points listés, plus NC-10 issu d'un écart constaté).
- **2026-11-09** : l'utilisatrice a validé les dix propositions ; elles sont intégrées aux exigences (FR-003, FR-004,
  FR-006, FR-009, FR-010, FR-011, FR-017, FR-020), aux scénarios (US4, US5), aux cas limites et à SC-003.
- Hypothèse restant à confirmer au plan, sans bloquer : les quatre catégories actives à la première activation ;
  nombre maximal d'appareils par utilisateur ; affichage imposé de chaque push sur Safari iPhone/iPad (D10).
- Prête pour `/speckit-plan`.
