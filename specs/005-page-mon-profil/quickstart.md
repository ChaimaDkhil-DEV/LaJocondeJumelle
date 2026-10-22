# Quickstart — 005 Page « Mon profil »

Guide de validation : chaque scénario renvoie aux exigences de la spec. Détails des écrans :
[contracts/ui.md](./contracts/ui.md) ; réponse `/api/auth/me` : [contracts/rest-api.md](./contracts/rest-api.md).

## Prérequis

- Dépendances installées (`npm ci`), application de développement lancée (`start.bat`) :
  API 3002, interface 5173, base locale 5433 avec le seed de démonstration.
- Comptes de démonstration : `enseignante` (Enseignants), `surveillant` (Surveillants), `admin`,
  `superadmin`, `autre` (aucun groupe), `nouveau` (changement imposé).

## Contrôles automatiques

```text
npm run verify                     lint, tests unitaires, d'intégration et frontend, audit
npm run -w backend typecheck
npm run -w frontend typecheck
npm run test:e2e                   dont auth.spec.ts (profil) et V18 à 320 px
```

Attendu : tout vert ; tests existants du changement imposé (`auth.spec.ts`, compte `nouveau`)
inchangés (SC-005).

## Scénarios manuels

1. **Lien du menu (FR-001, SC-001)** — connecté en `enseignante`, desktop : Tab jusqu'au bloc
   profil, lecteur d'écran : « Mon profil : Enseignante Employé, lien » ; Entrée → `/profil`.
   Mobile (320 px) : ouvrir le menu, activer le bloc → `/profil`, tiroir fermé.
2. **Informations (FR-003 à FR-005, SC-002)** — pour `enseignante`, `surveillant`, `admin`,
   `superadmin`, `autre` : nom, identifiant, fonction, rôle et groupes identiques à
   Administrateur › Comptes et Groupes ; `autre` : « Aucun » ; compte sans fonction :
   « Non renseignée » ; aucun champ modifiable, mention de l'administration présente.
3. **Changement volontaire (FR-006 à FR-008, FR-010, SC-003)** — connecté en `autre` dans deux
   navigateurs : dans le premier, profil → « Changer mon mot de passe » → saisir l'actuel et un
   nouveau de 12 caractères → retour au profil, confirmation « … autres sessions fermées » ; le
   second navigateur est renvoyé à la connexion ; connexion avec le nouveau mot de passe : OK.
   Journal d'audit (superadmin) : « Mot de passe changé » pour `autre`. Remettre l'ancien mot
   de passe.
4. **Annulation et erreurs (FR-007, FR-010)** — « Annuler » → profil, rien n'est changé ; mot de
   passe actuel faux, nouveau trop court, confirmation différente → message sous le champ
   concerné, rien n'est changé.
5. **Changement imposé inchangé (FR-009, SC-005)** — connexion en `nouveau` : page imposée, pas
   d'« Annuler », `/profil` redirige vers le changement ; après succès → accueil.
6. **Message serveur (FR-013)** — en `superadmin`, Administrateur › Comptes : réinitialiser son
   propre mot de passe → refus « Utilisez « Changer mon mot de passe » pour votre propre
   compte » ; l'action de ce nom existe sur « Mon profil ».
7. **Accessibilité (FR-011, FR-012, SC-004)** — clavier seul sur les deux pages (ordre de focus,
   focus visible), 320 px sans défilement horizontal, axe sans violation (couvert par V18).
