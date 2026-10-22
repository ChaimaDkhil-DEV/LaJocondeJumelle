# Feature Specification: Brouillons de demande de travail

**Feature Branch**: `007-brouillons-demandes`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Brouillons de demande de travail : écran pour enregistrer une demande
en brouillon, retrouver ses brouillons, les compléter, les envoyer ou les supprimer. Existant côté
serveur, complet et à réutiliser sans le changer. Côté interface : rien ne crée ni ne reprend un
brouillon. Besoin : depuis « Nouvelle demande », enregistrer en brouillon sans envoyer ; retrouver
ses brouillons dans « Mes demandes » ; ouvrir un brouillon dans le formulaire pré-rempli pour le
compléter, l'enregistrer, l'envoyer ou le supprimer (avec confirmation). Tous les rôles qui créent
des demandes. WCAG 2.2 AA, 320 px. Hors périmètre : enregistrement automatique en continu,
brouillons de garde, partage d'un brouillon."

## Clarifications

### Session 2026-10-22

- Q1 (emplacement des brouillons) → **A** : un onglet **« Brouillons »** dédié dans « Mes demandes »,
  affiché seulement quand l'auteur a au moins un brouillon ; les brouillons **ne figurent plus**
  dans « Envoyées », qui ne liste que les demandes réellement parties.

## Contexte

- Une demande de travail se crée et part aussitôt : un employé interrompu (cours, appel, réunion)
  perd ce qu'il a commencé à saisir ou à enregistrer à la voix.
- Le serveur gère déjà les brouillons de bout en bout : création, modification (titre,
  description, message vocal, catégorie, destinataire, priorité), suppression, envoi (vers
  « Envoyée » en mode direct, « En attente de validation » via l'administration). Un brouillon
  n'est visible que de son auteur ; il est exclu des tableaux de bord, des alertes et des
  statistiques. Un réglage d'administration (« Autoriser les brouillons de demande ») empêche d'en
  **créer** ; il n'empêche pas de reprendre, d'envoyer ni de supprimer un brouillon existant.
- Les brouillons apparaissent déjà dans « Mes demandes › Envoyées » avec le badge « Brouillon »,
  mais rien ne permet de les ouvrir pour les compléter : la fonctionnalité est **uniquement côté
  interface**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enregistrer une demande en brouillon (Priority: P1)

Une enseignante commence une demande de photocopies, choisit la catégorie, donne un titre et
enregistre un message vocal, puis doit partir en cours. Elle choisit « Enregistrer en brouillon » :
rien n'est envoyé, personne n'est prévenu, et elle retrouve sa demande plus tard.

**Why this priority**: c'est la valeur principale (ne rien perdre d'une demande commencée) ; sans
elle, les autres parcours n'ont pas d'objet.

**Independent Test**: depuis « Nouvelle demande », enregistrer en brouillon ; vérifier qu'aucun
destinataire ni admin n'est notifié et que le brouillon apparaît dans les demandes de l'auteur.

**Acceptance Scenarios**:

1. **Given** le formulaire « Nouvelle demande » avec au moins une catégorie et un titre, **When**
   l'auteur choisit « Enregistrer en brouillon », **Then** la demande est enregistrée au statut
   « Brouillon », un message confirme l'enregistrement, et rien n'est envoyé (aucune notification,
   aucun délai lancé).
2. **Given** un titre ou une catégorie manquants, **When** l'auteur choisit « Enregistrer en
   brouillon », **Then** un message clair, relié au champ, l'indique et rien n'est enregistré
   (description et message vocal restent facultatifs pour un brouillon).
3. **Given** un message vocal enregistré dans le formulaire, **When** l'auteur enregistre en
   brouillon, **Then** le message vocal est conservé avec le brouillon.
4. **Given** le réglage « Autoriser les brouillons de demande » désactivé, **When** l'auteur ouvre
   « Nouvelle demande », **Then** l'action « Enregistrer en brouillon » n'est pas proposée.

---

### User Story 2 - Retrouver, compléter et envoyer un brouillon (Priority: P1)

Plus tard, l'enseignante retrouve son brouillon dans « Mes demandes », l'ouvre : le formulaire est
pré-rempli. Elle complète la description et choisit « Envoyer » : la demande part exactement comme
si elle l'avait créée d'un coup (destinataire ou validation de l'administration selon la
catégorie).

**Why this priority**: indissociable de US1 — un brouillon qu'on ne peut ni retrouver ni envoyer
n'a pas d'utilité.

**Independent Test**: avec un brouillon existant, l'ouvrir depuis « Mes demandes », le compléter,
l'envoyer ; vérifier le statut obtenu et les notifications, identiques à une création directe.

**Acceptance Scenarios**:

1. **Given** des brouillons de l'auteur, **When** il ouvre « Mes demandes », **Then** un onglet
   « Brouillons » les liste, chacun avec le badge « Brouillon », son titre, sa catégorie et sa date
   de création ; « Envoyées » ne les montre plus.
6. **Given** un auteur sans brouillon, **When** il ouvre « Mes demandes », **Then** l'onglet
   « Brouillons » n'est pas affiché ; il apparaît dès le premier brouillon enregistré et disparaît
   quand le dernier est envoyé ou supprimé.
2. **Given** un brouillon, **When** l'auteur l'ouvre, **Then** le formulaire de demande s'affiche
   pré-rempli (catégorie, destinataire, priorité, titre, description, message vocal) avec les
   actions « Envoyer », « Enregistrer le brouillon » et « Supprimer le brouillon ».
3. **Given** le brouillon complété, **When** l'auteur choisit « Envoyer », **Then** la demande part
   selon les règles de sa catégorie (« Envoyée » au destinataire en mode direct, « En attente de
   validation » via l'administration), avec les mêmes notifications et délais qu'une création
   directe, et l'auteur est conduit au détail de la demande envoyée.
4. **Given** un brouillon sans description ni message vocal, **When** l'auteur choisit « Envoyer »,
   **Then** un message clair indique qu'il faut une description ou un message vocal, et rien n'est
   envoyé (même règle qu'à la création).
5. **Given** des modifications, **When** l'auteur choisit « Enregistrer le brouillon », **Then**
   elles sont enregistrées et le brouillon reste un brouillon.

---

### User Story 3 - Supprimer un brouillon (Priority: P2)

L'enseignante a réglé son besoin autrement : elle supprime le brouillon après confirmation.

**Why this priority**: utile pour garder une liste propre, mais un brouillon inutile ne gêne
personne d'autre (il n'est visible que de son auteur).

**Independent Test**: supprimer un brouillon après confirmation ; il disparaît de « Mes demandes » ;
annuler la confirmation ne supprime rien.

**Acceptance Scenarios**:

1. **Given** un brouillon ouvert, **When** l'auteur choisit « Supprimer le brouillon » et confirme,
   **Then** le brouillon est supprimé définitivement (avec son message vocal), un message le
   confirme, et l'auteur revient à « Mes demandes ».
2. **Given** la demande de confirmation, **When** l'auteur annule, **Then** rien n'est supprimé.

---

### Edge Cases

- **Réglage désactivé après coup** : les brouillons existants restent visibles, modifiables,
  envoyables et supprimables ; seule la création d'un nouveau brouillon est retirée.
- **Catégorie désactivée** entre l'enregistrement et l'envoi : l'envoi est refusé avec un message
  clair (règle existante) ; l'auteur peut choisir une autre catégorie active et réessayer.
- **Destinataire qui n'est plus valide** (compte désactivé, plus destinataire de la catégorie) :
  refus avec message clair à l'envoi (règle existante) ; l'auteur choisit un autre destinataire.
- **Brouillon ouvert dans deux onglets** : la seconde action sur un brouillon déjà envoyé ou
  supprimé est refusée avec un message clair, puis la page se recharge.
- **Brouillon d'un autre utilisateur** : jamais visible ni atteignable (règle existante).
- **Quitter le formulaire sans enregistrer** : les modifications non enregistrées sont perdues
  (pas d'enregistrement automatique, hors périmètre).
- **Mobile, 320 px** : actions et liste utilisables sans défilement horizontal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le formulaire « Nouvelle demande » DOIT proposer « Enregistrer en brouillon » à côté
  de l'envoi, quand le réglage « Autoriser les brouillons de demande » est activé, et seulement
  dans ce cas.
- **FR-002**: Un brouillon DOIT pouvoir être enregistré dès qu'une catégorie et un titre sont
  renseignés ; description, message vocal, destinataire et priorité restent facultatifs pour un
  brouillon (la priorité par défaut s'applique).
- **FR-003**: Enregistrer un brouillon NE DOIT déclencher ni notification, ni délai, ni apparition
  chez un autre utilisateur.
- **FR-004**: L'auteur DOIT retrouver ses brouillons dans un onglet « Brouillons » de « Mes
  demandes », du plus récent au plus ancien (date de création, comme les autres listes). L'onglet n'est affiché que si
  l'auteur a au moins un brouillon.
- **FR-004b**: L'onglet « Envoyées » NE DOIT lister que les demandes envoyées (aucun brouillon).
- **FR-005**: Ouvrir un brouillon DOIT afficher le formulaire de demande pré-rempli avec toutes ses
  valeurs, message vocal compris (réécoutable, remplaçable, supprimable comme à la création).
- **FR-006**: Depuis un brouillon ouvert, l'auteur DOIT pouvoir : l'enregistrer (il reste brouillon),
  l'envoyer (mêmes règles, notifications et délais qu'une création directe), le supprimer après
  confirmation.
- **FR-007**: L'envoi d'un brouillon DOIT appliquer les contrôles existants (description ou message
  vocal, catégorie active, destinataire permis) avec des messages clairs reliés aux champs.
- **FR-008**: Les brouillons existants DOIVENT rester utilisables (ouvrir, enregistrer, envoyer,
  supprimer) quand le réglage est désactivé.
- **FR-009**: Une action sur un brouillon déjà envoyé, supprimé ou modifié ailleurs DOIT être
  refusée avec un message clair, suivie du rechargement de la liste ou du détail.
- **FR-010**: Les actions et la liste DOIVENT respecter les WCAG 2.2 AA (clavier, libellés, focus,
  confirmations et erreurs annoncées) et tenir en 320 px de large.

### Key Entities *(include if feature involves data)*

- **Demande de travail au statut « Brouillon »** (existante) : catégorie, destinataire, priorité,
  titre, description, message vocal, auteur, dates de création et de modification. Visible de son
  seul auteur. Aucune donnée nouvelle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un auteur interrompu enregistre sa demande en cours en 1 action, sans rien perdre de
  ce qu'il a saisi (titre, description, message vocal).
- **SC-002**: Un brouillon se retrouve et s'ouvre en 2 actions au plus depuis « Mes demandes ».
- **SC-003**: 100 % des brouillons envoyés obtiennent le même statut, les mêmes destinataires et
  les mêmes notifications qu'une demande créée et envoyée d'un coup dans la même catégorie.
- **SC-004**: 0 notification, alerte ou entrée de tableau de bord n'est produite par un brouillon
  tant qu'il n'est pas envoyé.
- **SC-005**: Aucune violation d'accessibilité détectée par l'audit automatique sur le formulaire
  (création et reprise de brouillon) et la liste des brouillons, à 320 px et sur desktop.

## Assumptions

- Aucune règle métier nouvelle côté serveur : création en brouillon, modification, suppression,
  envoi, visibilité et réglage existent et sont réutilisés tels quels. Seul le filtrage de la liste
  « Envoyées » (sans brouillon, FR-004b) peut demander un ajustement, tranché au plan.
- Les brouillons concernent les demandes de travail seulement, pas les affectations (gardes).
- Les rôles qui peuvent créer des demandes (tous, selon les catégories) peuvent créer des
  brouillons ; les règles de catégorie (rôles créateurs, mode de routage) sont celles de la
  création directe.
- Pas d'enregistrement automatique en continu, pas de partage, pas de durée de conservation
  propre (un brouillon reste jusqu'à son envoi ou sa suppression).
- Pas d'avertissement « modifications non enregistrées » en quittant le formulaire.
