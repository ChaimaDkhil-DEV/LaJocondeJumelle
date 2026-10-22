# Research — 005 Page « Mon profil »

Aucune inconnue technique : la fonctionnalité réutilise la pile, l'authentification, la page de
changement de mot de passe et les composants existants. Les décisions ci-dessous fixent les choix
de conception à partir du code de `master` (`dafec78`).

## R1 — Source des informations du profil

- **Decision** : ajouter `username` et `jobTitle` (`string | null`) à la réponse existante
  `GET /api/auth/me` (et `POST /api/auth/login`, qui renvoie le même type `MeResponse`). Les
  groupes viennent déjà de `isTeacher` et `isSupervisor`.
- **Rationale** : la session charge déjà la ligne complète de l'utilisateur
  (`session.service.ts`, `include: { user: true }`) ; `username` est déjà dans
  `AuthenticatedUser`, `jobTitle` s'y ajoute sans requête de plus. Le profil réutilise le cache
  `useCurrentUser`, déjà chargé sur toutes les pages. Les deux champs ne concernent que le compte
  connecté, qui les connaît déjà : pas de nouvelle exposition de données personnelles.
- **Alternatives considered** : nouvel endpoint `GET /api/auth/profile` (une route, un contrôle
  d'accès et un cache de plus pour deux champs : rejeté, principe II) ; lecture via
  `/api/admin/users/:id` (réservé au super administrateur : impossible pour les autres rôles).

## R2 — Route et emplacement de la page

- **Decision** : nouvelle route `/profil`, enfant de `AppLayout` (donc derrière `RequireAuth`),
  page `frontend/src/features/auth/ProfilePage.tsx`.
- **Rationale** : `RequireAuth` redirige déjà vers `/mot-de-passe` tant que le changement est
  imposé : le profil est inatteignable dans ce cas sans code de plus (cas limite de la spec). Le
  menu et le tiroir mobile restent disponibles sur la page.
- **Alternatives considered** : page hors gabarit comme `/mot-de-passe` (perd le menu : rejeté).

## R3 — Lien du bloc profil (desktop et tiroir mobile)

- **Decision** : le bloc `Person` (nom et rôle) devient le contenu d'un lien vers `/profil`,
  précédé d'un texte masqué visuellement « Mon profil : ». Nom accessible :
  « Mon profil : <nom> <rôle> ». Le lien ferme le tiroir mobile, comme les entrées du menu.
- **Rationale** : le nom accessible contient le texte visible (WCAG 2.5.3 « Label in Name »),
  ce qu'un `aria-label` remplaçant le contenu ne garantit pas. Un seul élément `user` est déjà
  partagé par la barre latérale et le tiroir : une seule modification.
- **Alternatives considered** : entrée « Mon profil » de plus dans la navigation principale
  (doublon visuel du bloc existant : rejeté) ; `aria-label` seul (risque Label in Name : rejeté).

## R4 — Parcours volontaire de changement de mot de passe

- **Decision** : la page `/mot-de-passe` existante choisit son mode d'après
  `me.mustChangePassword` (état serveur) :
  - imposé (`true`) : inchangé, pas d'annulation, succès → accueil (`/`) ;
  - volontaire (`false`) : bouton « Annuler » → `/profil` ; succès → `/profil` avec un message
    de confirmation (statut annoncé) précisant que les autres sessions sont fermées.
- **Rationale** : le mode dépend de l'état du compte, pas d'un paramètre d'URL qu'on pourrait
  manipuler pour éviter le changement imposé. Aucune règle serveur ne change : vérification du
  mot de passe actuel, 12 caractères, fermeture des autres sessions et audit `PASSWORD_CHANGED`
  existent déjà (`auth.service.ts`).
- **Alternatives considered** : formulaire intégré dans la page profil (duplique la page et ses
  tests : rejeté) ; paramètre `?depuis=profil` (manipulable, inutile : rejeté).

## R5 — Message serveur « Changer mon mot de passe » (FR-013)

- **Decision** : l'action de la page profil porte exactement le libellé « Changer mon mot de
  passe », celui du message de refus de `users.service.ts` ; le message n'est pas modifié.
- **Rationale** : le message devient juste dès que l'action existe ; aucun changement serveur.

## R6 — Stratégie de test (principe I)

- **Unitaires backend** : `toMeResponse` renvoie `username` et `jobTitle` (`null` si absent).
- **Intégration backend** (`backend/test/integration/auth.spec.ts`) : `GET /api/auth/me` renvoie
  `username` et `jobTitle` du compte connecté, et seulement les siens.
- **Frontend (Vitest + Testing Library)** : nouvelle suite `frontend/tests/auth/profile.test.tsx`
  (contenu de la page, libellés « Non renseignée » / « Aucun », aucun champ modifiable, lien
  « Changer mon mot de passe ») ; parcours volontaire et imposé de `ChangePasswordPage`
  (annulation, retour au profil, confirmation, mode imposé inchangé) ; lien du bloc profil.
- **Bout en bout** : nouveau test Chromium dans `e2e/auth.spec.ts` : ouvrir le profil depuis le
  menu, changer le mot de passe d'un compte de démonstration, vérifier la fermeture d'une autre
  session et la connexion avec le nouveau mot de passe, puis **remettre l'ancien** pour laisser
  la base e2e rejouable (même principe que les parcours d'affectations). Ajout de la page
  « Mon profil » à V18 (`e2e/a11y-responsive.spec.ts`, 320 px, axe).
- **Synchronisation des types** : `Me` (frontend, écrit à la main) reçoit les deux champs ; la
  vérification existante `enums-sync.test.ts` porte sur les énumérations, non sur `Me` : rien à
  ajouter.
