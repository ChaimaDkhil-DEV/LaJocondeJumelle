# Feature Specification: Page « Mon profil » et accès au changement de mot de passe

**Feature Branch**: `005-page-mon-profil`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Page « Mon profil » pour tout utilisateur connecté (employé, admin,
super administrateur). Aujourd'hui le bloc profil du menu latéral affiche seulement le nom et le
rôle, sans lien ni page ; le changement de mot de passe existe (imposé à la première connexion,
ferme les autres sessions) mais aucun lien n'y mène, alors que le serveur y renvoie dans son
message de refus (« Utilisez « Changer mon mot de passe » pour votre propre compte »). Besoin :
le bloc profil devient un lien vers une page « Mon profil » qui affiche les informations du compte
en lecture seule (nom, identifiant, fonction, rôle, appartenance aux groupes
Surveillants/Enseignants le cas échéant) et propose « Changer mon mot de passe ». Accessible au
clavier, WCAG 2.2 AA, mobile (320 px) et desktop. Hors périmètre : modification du nom ou de la
fonction par l'utilisateur lui-même (reste à l'administration), photo de profil."

## Contexte

- Le bloc profil du menu (nom et rôle) n'est ni un lien ni un bouton ; aucune page de profil
  n'existe (`docs/superadmin-fonctionnalites.md` §4.2).
- Le changement de mot de passe existe déjà : page dédiée, mot de passe actuel puis nouveau mot de
  passe (12 caractères au moins) et confirmation ; il ferme les autres sessions du compte. Il
  n'est atteint qu'à la première connexion (imposé) : aucun lien n'y mène ensuite.
- Le serveur renvoie un super administrateur qui tente de réinitialiser son propre mot de passe
  vers « Changer mon mot de passe », introuvable dans l'interface.
- Cette fonctionnalité **ne crée rien de nouveau côté règles** : elle rend visibles des
  informations existantes du compte et rend accessible un parcours existant.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Changer son mot de passe quand on le souhaite (Priority: P1)

Un utilisateur connecté (employé, admin ou super administrateur) veut changer son mot de passe,
par exemple parce qu'il pense qu'il a été vu. Depuis le menu, il ouvre son profil, choisit
« Changer mon mot de passe », saisit l'actuel puis le nouveau, et revient à son profil avec la
confirmation que le changement est fait et que ses autres sessions ont été fermées.

**Why this priority**: c'est le manque qui a une conséquence de sécurité : aujourd'hui, un
utilisateur ne peut changer son mot de passe que si l'administration le réinitialise. Le message
du serveur renvoie vers un lien qui n'existe pas.

**Independent Test**: se connecter, ouvrir le profil depuis le menu, changer le mot de passe,
se déconnecter puis se reconnecter avec le nouveau mot de passe ; une session ouverte dans un
autre navigateur est fermée.

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté, **When** il active le bloc profil du menu, **Then** la page
   « Mon profil » s'ouvre et propose « Changer mon mot de passe ».
2. **Given** la page « Mon profil », **When** il choisit « Changer mon mot de passe », saisit son
   mot de passe actuel et un nouveau mot de passe valide confirmé, **Then** le mot de passe est
   changé, il revient sur « Mon profil » avec un message de confirmation qui indique que ses
   autres sessions ont été fermées, et il reste connecté dans le navigateur courant.
3. **Given** le formulaire de changement ouvert depuis le profil, **When** il choisit
   « Annuler » (ou revient en arrière), **Then** il retrouve « Mon profil » sans changement.
4. **Given** le formulaire, **When** le mot de passe actuel est faux, ou le nouveau trop court, ou
   la confirmation différente, **Then** un message clair, associé au champ concerné, l'indique et
   rien n'est changé.
5. **Given** un utilisateur dont le changement est **imposé** (première connexion ou mot de passe
   réinitialisé), **When** il se connecte, **Then** le parcours actuel est inchangé : la page de
   changement s'impose, sans possibilité de l'éviter, et mène à l'accueil une fois le changement
   fait.

---

### User Story 2 - Consulter les informations de son compte (Priority: P2)

Un utilisateur veut vérifier sous quel identifiant il se connecte, quel rôle et quelle fonction
lui ont été attribués, et s'il fait partie des surveillants ou des enseignants (ce qui conditionne
ce qu'il voit dans « Gardes »). Il ouvre « Mon profil » et lit ces informations, sans pouvoir les
modifier ; la page lui indique que les modifications passent par l'administration.

**Why this priority**: utile et attendu, mais sans conséquence de sécurité ; les informations
existent déjà ailleurs (administration) pour le super administrateur.

**Independent Test**: se connecter avec un compte de chaque rôle et un compte membre de chaque
groupe ; la page affiche les bonnes valeurs, aucune n'est modifiable.

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté, **When** il ouvre « Mon profil », **Then** il voit son nom,
   son identifiant de connexion, sa fonction, son rôle (Employé, Admin ou Super administrateur),
   et ses groupes d'affectation (Surveillants, Enseignants) s'il en fait partie.
2. **Given** un compte sans fonction renseignée ou membre d'aucun groupe d'affectation, **When**
   il ouvre son profil, **Then** la page l'indique explicitement (par exemple « Non renseignée »,
   « Aucun »), sans champ vide ni erreur.
3. **Given** la page « Mon profil », **When** il cherche à modifier son nom ou sa fonction,
   **Then** aucune modification n'est possible et la page indique qu'elles se demandent à
   l'administration.
4. **Given** un compte dont l'administration vient de modifier le rôle, la fonction ou les
   groupes, **When** l'utilisateur ouvre ou recharge son profil, **Then** il voit les valeurs à
   jour.

---

### Edge Cases

- **Changement imposé en cours** : tant que le changement est imposé, le profil n'est pas
  atteignable (le parcours imposé prime, comme aujourd'hui pour toute page).
- **Session expirée** pendant la saisie : le comportement actuel s'applique (retour à la
  connexion), aucun mot de passe n'est changé.
- **Autres sessions ouvertes** (autre navigateur, téléphone) : fermées par le changement, comme
  aujourd'hui ; l'utilisateur en est informé dans la confirmation.
- **Nouveau mot de passe identique à l'actuel** : même règle qu'aujourd'hui (aucune nouvelle
  règle introduite par cette fonctionnalité).
- **Mobile** : le bloc profil est dans le tiroir du menu ; il doit y mener au profil de la même
  façon, et la page tient en 320 px sans défilement horizontal.
- **Compte désactivé pendant la consultation** : comportement actuel (session fermée, retour à
  la connexion).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le bloc profil du menu (desktop et tiroir mobile) DOIT être un lien vers la page
  « Mon profil », annoncé comme tel aux technologies d'assistance (nom accessible explicite, par
  exemple « Mon profil, <nom> »).
- **FR-002**: La page « Mon profil » DOIT être accessible à tout utilisateur connecté, quel que
  soit son rôle, et à lui seul : elle n'affiche que les informations du compte connecté.
- **FR-003**: La page DOIT afficher, en lecture seule : nom, identifiant de connexion, fonction,
  rôle, et groupes d'affectation (Surveillants, Enseignants) dont le compte est membre.
- **FR-004**: Une valeur absente (fonction non renseignée, aucun groupe) DOIT être affichée par
  un libellé explicite, jamais par un champ vide.
- **FR-005**: La page DOIT indiquer que le nom, la fonction, le rôle et les groupes se modifient
  par l'administration, et NE DOIT offrir aucun moyen de les modifier.
- **FR-006**: La page DOIT proposer l'action « Changer mon mot de passe », qui ouvre le parcours
  de changement existant (mêmes règles et mêmes messages qu'aujourd'hui).
- **FR-007**: Ouvert depuis le profil, le parcours de changement DOIT permettre d'annuler et de
  revenir au profil sans rien changer.
- **FR-008**: Après un changement réussi depuis le profil, l'utilisateur DOIT revenir sur
  « Mon profil » avec un message de confirmation, annoncé aux technologies d'assistance, qui
  précise que ses autres sessions ont été fermées ; il reste connecté dans le navigateur courant.
- **FR-009**: Le parcours de changement **imposé** (première connexion, mot de passe réinitialisé)
  DOIT rester inchangé : obligatoire, sans annulation possible, puis accueil.
- **FR-010**: Le changement de mot de passe DOIT conserver ses garanties actuelles : vérification
  du mot de passe actuel, longueur minimale, fermeture des autres sessions, journalisation dans le
  journal d'audit.
- **FR-011**: La page et le parcours DOIVENT respecter les WCAG 2.2 AA : utilisables entièrement
  au clavier, titres et ordre de lecture cohérents, focus visible, erreurs reliées aux champs,
  aucune violation détectée par l'outil d'audit automatique du projet.
- **FR-012**: La page DOIT tenir en 320 px de large sans défilement horizontal, et rester lisible
  sur desktop.
- **FR-013**: Le message de refus qui renvoie vers « Changer mon mot de passe » DOIT désigner une
  action réellement présente dans l'interface, avec le même libellé.

### Key Entities *(include if feature involves data)*

- **Compte utilisateur** (existant) : nom, identifiant de connexion, fonction, rôle, état « mot de
  passe à changer ». Lu, jamais modifié par cette fonctionnalité, hormis le mot de passe par le
  parcours existant.
- **Groupe d'affectation** (existant) : groupes à clé système Surveillants et Enseignants ; seule
  l'appartenance du compte connecté est affichée.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Depuis n'importe quelle page de l'application, un utilisateur atteint le formulaire
  de changement de mot de passe en 2 actions au plus (ouvrir le profil, puis « Changer mon mot de
  passe »), au clavier comme à la souris, sur mobile comme sur desktop.
- **SC-002**: 100 % des comptes de démonstration (un par rôle, plus un membre de chaque groupe)
  voient sur leur profil des informations identiques à celles de l'administration.
- **SC-003**: Après un changement réussi depuis le profil, 100 % des autres sessions du compte sont
  fermées et la connexion avec le nouveau mot de passe réussit.
- **SC-004**: Aucune violation d'accessibilité détectée par l'audit automatique sur la page
  « Mon profil » et sur le parcours de changement, à 320 px et sur desktop.
- **SC-005**: Le parcours imposé à la première connexion reste couvert par ses tests existants,
  sans changement de leurs attendus.

## Assumptions

- Les informations affichées existent déjà dans le compte ; aucune nouvelle donnée n'est créée.
  Le compte connecté peut lire ses propres informations, et elles seules.
- L'étage de rattachement d'un surveillant, les catégories dont l'utilisateur est destinataire ou
  admin, et les permissions détaillées par rôle ne sont **pas** affichés dans cette première
  version (affichage minimal demandé) ; ils restent consultables par le super administrateur dans
  l'administration.
- La page de changement de mot de passe existante est réutilisée ; seuls l'accès, l'annulation et
  le retour au profil sont ajoutés pour le parcours volontaire.
- Les règles de mot de passe (12 caractères au moins) et la fermeture des autres sessions ne
  changent pas.
- Hors périmètre (confirmé) : modification du nom ou de la fonction par l'utilisateur, photo de
  profil, préférences (notifications, langue), historique de connexion personnel.
