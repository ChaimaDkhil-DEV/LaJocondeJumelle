# Feature Specification: Lot 1 – Demandes de travail et messagerie vocale

> **Depuis la fonctionnalité 004, le rôle « Responsable » s'appelle « Admin » ; la terminologie de la
> spécification courante (`specs/004-retards-affectation-surveillants/spec.md`) fait foi.**

**Feature Branch**: `001-demandes-travail-vocales`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Lot 1 : demandes de travail et messagerie vocale pour une école
privée. Les employés adressent des demandes de travail à d'autres employés ou à des responsables,
en parlant plutôt qu'en écrivant, depuis un smartphone, une tablette ou un ordinateur ; demandes,
échanges et décisions centralisés et traçables ; deux circuits (direct / validation
administrative), délais suivis, notifications en temps réel, historique, recherche et filtres."

## Clarifications

### Session 2026-10-12

- Q: Quand un responsable refuse une demande soumise à validation administrative, quel statut
  prend-elle ? → A: Un nouveau statut final « Refusée », qui conserve le motif ; le demandeur
  peut créer une nouvelle demande s'il le souhaite.
- Q: En circuit direct, l'employé qui reçoit une demande peut-il la refuser ou la transmettre à
  quelqu'un d'autre ? → A: Il peut la refuser avec un motif obligatoire ; la demande passe
  « Refusée » et le demandeur est notifié. Il ne peut pas la transmettre lui-même.
- Q: Le demandeur peut-il annuler une demande déjà envoyée, et jusqu'à quand ? → A: Oui, tant
  qu'elle n'est pas acceptée (« Envoyée » ou « En attente de validation administrative ») ;
  elle passe au nouveau statut final « Annulée ».
- Q: En plus des notifications dans l'application, faut-il prévenir les utilisateurs quand
  l'application est fermée ? → A: Non, notifications dans l'application uniquement ; ni push ni
  e-mail dans ce lot.
- Q: À qui un employé peut-il adresser une demande ? → A: Aux destinataires définis pour la
  catégorie choisie (liste paramétrée par le super administrateur).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Créer et envoyer une demande vocale (Priority: P1)

Une enseignante a besoin de photocopies. Depuis son téléphone, elle choisit le destinataire,
enregistre un message vocal, le réécoute, le recommence si besoin, ajoute un titre, choisit la
catégorie « Photocopies » et une priorité (Normale, Moyenne, Haute ou Urgente), puis envoie. La
demande apparaît avec le statut « Envoyée » et sa date et heure de création. Le destinataire la
voit dans sa liste de demandes reçues et peut écouter le vocal.

**Why this priority**: c'est la raison d'être du produit. Les employés doivent pouvoir formuler
une demande à la voix, rapidement, sans écrire.

**Independent Test**: un employé crée une demande vocale de catégorie à circuit direct ; le
destinataire se connecte, retrouve la demande et écoute le vocal. Ce test fonctionne sans les
autres stories.

**Acceptance Scenarios**:

1. **Given** une employée connectée sur smartphone, **When** elle enregistre un vocal, le
   réécoute, renseigne titre, catégorie, un destinataire parmi ceux de la catégorie et la
   priorité puis envoie, **Then** la
   demande est créée au statut « Envoyée », horodatée et visible du destinataire.
2. **Given** un vocal enregistré mais pas encore envoyé, **When** l'employée le réécoute puis
   choisit de le refaire, **Then** l'ancien enregistrement est remplacé et seul le nouveau est
   envoyé.
3. **Given** une demande sans titre, catégorie, destinataire ou priorité, **When** l'employée
   tente de l'envoyer, **Then** l'envoi est bloqué et chaque champ manquant est signalé
   clairement.
4. **Given** une perte de connexion pendant l'envoi, **When** l'envoi échoue, **Then**
   l'employée est informée de l'échec, sa demande et son vocal sont conservés sur l'appareil et
   elle peut relancer l'envoi sans tout refaire.
5. **Given** un appareil dont l'accès au micro est refusé, **When** l'employée veut enregistrer,
   **Then** un message explique comment autoriser le micro, et elle peut tout de même envoyer
   une demande avec une description écrite.

---

### User Story 2 - Traiter une demande en circuit direct (Priority: P1)

Le destinataire reçoit la demande, l'écoute, l'accepte, la passe « En cours », puis
« Terminée » en joignant une photo de preuve si la catégorie l'exige. La demandeuse consulte le
résultat : soit la demande est clôturée (automatiquement ou par une personne autorisée selon la
catégorie), soit elle la renvoie « À corriger » avec un commentaire.

**Why this priority**: sans traitement, une demande n'a pas de valeur ; avec la story 1, elle
forme le parcours minimal viable de bout en bout.

**Independent Test**: à partir d'une demande « Envoyée », le destinataire la mène jusqu'à
« Terminée », puis la demandeuse la clôture ou la renvoie « À corriger ».

**Acceptance Scenarios**:

1. **Given** une demande « Envoyée » affectée à un employé, **When** il l'accepte, **Then** son
   statut passe à « Acceptée » et l'heure d'acceptation est enregistrée.
2. **Given** une demande « Acceptée », **When** l'employé affecté la passe « En cours », puis
   « Terminée », **Then** chaque changement est horodaté et visible de la demandeuse.
3. **Given** une catégorie exigeant une photo de preuve, **When** l'employé tente de passer la
   demande à « Terminée » sans photo, **Then** le changement est refusé avec un message
   expliquant qu'une photo est requise.
4. **Given** une demande « Terminée », **When** la demandeuse la renvoie « À corriger » sans
   commentaire, **Then** l'action est refusée ; avec un commentaire, la demande passe « À
   corriger » et l'employé affecté est notifié.
5. **Given** une catégorie à clôture automatique, **When** la demande passe « Terminée » et
   que la demandeuse ne la renvoie pas « À corriger » dans le délai de grâce de la catégorie
   (24 h par défaut), **Then** elle est clôturée automatiquement à l'expiration de ce délai et
   l'heure de clôture est enregistrée.
6. **Given** une demande « Envoyée » affectée à un employé qui ne peut pas la traiter, **When**
   il la refuse avec un motif, **Then** elle passe « Refusée » et la demandeuse est notifiée
   avec le motif ; sans motif, le refus est bloqué.
7. **Given** un utilisateur sans le droit requis, **When** il tente une transition de statut
   (par ex. accepter une demande qui ne lui est pas affectée), **Then** la transition est
   refusée et la tentative est journalisée.

---

### User Story 3 - Échanger dans le fil de la demande (Priority: P2)

Chaque demande possède un fil de discussion. Le demandeur, l'employé affecté et les responsables
autorisés y répondent par texte ou par vocal, et y joignent des photos (prises avec l'appareil
ou depuis la galerie) ou des fichiers de formats autorisés.

**Why this priority**: les précisions et les preuves sont fréquentes, mais le parcours minimal
fonctionne sans fil de discussion.

**Independent Test**: sur une demande existante, deux participants échangent un message texte,
un vocal et une photo ; chaque élément affiche son auteur et sa date et heure.

**Acceptance Scenarios**:

1. **Given** une demande ouverte, **When** un participant envoie un message texte ou vocal,
   **Then** il apparaît dans le fil avec l'auteur et la date et heure, et les autres
   participants le voient sans recharger la page.
2. **Given** un participant sur smartphone, **When** il prend une photo depuis le fil, **Then**
   elle est jointe à la demande et visible des participants autorisés.
3. **Given** un fichier d'un format non autorisé ou trop volumineux, **When** un participant
   tente de le joindre, **Then** l'ajout est refusé avec un message indiquant les formats et la
   taille acceptés.
4. **Given** un utilisateur non autorisé sur la demande, **When** il tente d'accéder au fil,
   à un vocal ou à une pièce jointe (y compris par lien direct), **Then** l'accès est refusé
   sans révéler le contenu ni l'existence de la demande.

---

### User Story 4 - Recevoir les notifications en temps réel (Priority: P2)

Chaque utilisateur est averti, sans recharger la page, des événements qui le concernent :
nouvelle demande, nouveau message, affectation, changement de statut, demande urgente, demande à
corriger, clôture.

**Why this priority**: la rapidité de réaction (notamment pour les urgences) dépend des
notifications, mais le traitement reste possible en consultant la liste des demandes.

**Independent Test**: un utilisateur garde l'application ouverte ; un autre crée une demande
pour lui ; la notification apparaît sans action de sa part.

**Acceptance Scenarios**:

1. **Given** un destinataire ayant l'application ouverte, **When** une demande lui est envoyée,
   **Then** une notification apparaît en quelques secondes sans rechargement.
2. **Given** une demande de priorité « Urgente », **When** elle est envoyée ou affectée,
   **Then** la notification est visuellement distincte des notifications ordinaires.
3. **Given** un utilisateur déconnecté au moment d'un événement, **When** il se reconnecte,
   **Then** il retrouve les notifications non lues.

---

### User Story 5 - Circuit avec validation administrative (Priority: P2)

Pour les catégories configurées en circuit B, la demande est d'abord soumise à un responsable
autorisé. Il l'approuve ou la refuse (motif obligatoire). Après approbation, la demande est
affectée à un employé, manuellement ou automatiquement selon la catégorie. Si la catégorie
l'exige, une validation finale est requise après la réalisation avant la clôture.

**Why this priority**: indispensable pour certaines catégories, mais le circuit direct couvre
déjà le scénario principal.

**Independent Test**: un employé crée une demande d'une catégorie en circuit B ; un responsable
l'approuve et l'affecte ; l'employé affecté la réalise ; le responsable effectue la validation
finale.

**Acceptance Scenarios**:

1. **Given** une catégorie en circuit B, **When** un employé envoie une demande, **Then** elle
   passe « En attente de validation administrative » et n'est visible d'aucun agent exécutant.
2. **Given** une demande en attente de validation, **When** un responsable la refuse sans motif,
   **Then** le refus est bloqué ; avec un motif, la demande passe au statut final « Refusée »
   et le demandeur est notifié avec le motif.
3. **Given** une demande approuvée dans une catégorie à affectation manuelle, **When** le
   responsable choisit l'employé, **Then** la demande lui est affectée au statut « Envoyée » et
   il est notifié.
4. **Given** une catégorie à affectation automatique, **When** la demande est approuvée,
   **Then** elle est affectée selon la règle de la catégorie, sans action manuelle.
5. **Given** une catégorie avec validation finale, **When** la demande passe « Terminée »,
   **Then** elle passe « En attente de validation finale » ; le validateur la clôture ou la
   renvoie « À corriger » avec un commentaire.

---

### User Story 6 - Suivre les délais et les retards (Priority: P3)

Chaque demande affiche le temps restant pour l'étape en cours : validation administrative,
prise en charge ou réalisation. Les demandes proches de l'échéance ou en retard sont signalées.
En cas de dépassement, la demande est marquée « En retard » en précisant l'étape, et le
responsable concerné est notifié.

**Why this priority**: améliore la réactivité, mais le traitement fonctionne sans suivi des
délais.

**Independent Test**: on configure un délai court pour une catégorie et une priorité, on crée
une demande sans l'accepter, et on vérifie l'affichage du temps restant puis le marquage « En
retard (prise en charge) ».

**Acceptance Scenarios**:

1. **Given** une demande avec un délai de prise en charge configuré, **When** un utilisateur
   autorisé l'affiche, **Then** il voit le temps restant pour l'étape en cours.
2. **Given** une demande dont le délai de l'étape en cours est presque écoulé, **When** la liste
   est affichée, **Then** la demande est signalée comme proche de l'échéance.
3. **Given** une demande dont le délai est dépassé, **When** l'échéance passe, **Then** elle est
   marquée « En retard » avec l'étape concernée, reste visible, et le responsable concerné est
   notifié.
4. **Given** une demande en retard, **When** elle est finalement traitée, **Then** le retard
   reste visible dans son historique et elle n'est jamais supprimée automatiquement.

---

### User Story 7 - Consulter l'historique, rechercher et filtrer (Priority: P3)

Chaque utilisateur retrouve les demandes auxquelles il a accès, les filtre par statut, priorité,
catégorie, destinataire et période, et consulte l'historique complet d'une demande.

**Why this priority**: utile dès que le volume grandit, mais pas nécessaire au premier usage.

**Independent Test**: avec un jeu de demandes variées, un utilisateur applique des filtres
combinés et ne voit que les demandes correspondantes auxquelles il a droit.

**Acceptance Scenarios**:

1. **Given** plusieurs demandes, **When** un utilisateur filtre par statut « En cours » et
   priorité « Urgente », **Then** seules les demandes correspondantes et autorisées
   s'affichent.
2. **Given** une demande traitée, **When** un utilisateur autorisé ouvre son historique,
   **Then** il voit chaque action (statut, priorité, affectation, messages, pièces jointes)
   avec auteur, date et heure.
3. **Given** un utilisateur, **When** il effectue une recherche, **Then** aucune demande à
   laquelle il n'a pas accès n'apparaît dans les résultats.

---

### User Story 8 - Administrer comptes, rôles et paramètres (Priority: P3)

Le super administrateur gère les comptes, les rôles, les permissions, les catégories (circuit,
validation finale, photo obligatoire, mode de clôture, mode d'affectation), les délais par
catégorie et priorité, et consulte les journaux d'audit.

**Why this priority**: nécessaire au déploiement, mais un paramétrage initial fourni à la mise
en service permet de tester les autres stories indépendamment.

**Independent Test**: le super administrateur crée un compte, lui attribue un rôle, crée une
catégorie en circuit B avec photo obligatoire, et vérifie que le nouveau comportement
s'applique aux nouvelles demandes.

**Acceptance Scenarios**:

1. **Given** un super administrateur, **When** il crée un compte avec le rôle « Employé »,
   **Then** l'utilisateur peut se connecter et n'a que les droits de ce rôle.
2. **Given** un super administrateur, **When** il modifie le délai de prise en charge d'une
   catégorie et d'une priorité, **Then** la modification s'applique aux demandes créées ensuite
   et est tracée dans le journal d'audit.
3. **Given** un utilisateur sans rôle super administrateur, **When** il tente d'accéder aux
   paramètres, **Then** l'accès est refusé et journalisé.

---

### Edge Cases

- Perte de réseau pendant l'enregistrement ou l'envoi d'un vocal : le contenu est conservé
  localement et l'utilisateur peut relancer l'envoi ; aucun envoi partiel n'est présenté comme
  réussi.
- Vocal dépassant la durée ou la taille maximale : l'enregistrement s'arrête à la limite et
  l'utilisateur en est averti.
- Vocal vide ou inaudible (durée quasi nulle) : l'envoi est bloqué avec un message explicatif.
- Navigateur ou appareil ne permettant pas l'enregistrement audio : l'utilisateur en est
  informé et peut saisir une description écrite à la place.
- Deux utilisateurs modifient le statut de la même demande au même moment : une seule
  transition est appliquée ; l'autre utilisateur est informé que l'état a changé.
- Destinataire désactivé ou parti de l'école alors qu'une demande lui est affectée : la demande
  reste visible et un responsable peut la réaffecter.
- Demande adressée à la mauvaise personne en circuit direct : le destinataire la refuse avec un
  motif (statut « Refusée ») ; il ne peut pas la transmettre lui-même. Le demandeur crée une
  nouvelle demande pour le bon destinataire.
- Demandeur qui veut retirer sa demande : il peut l'annuler (statut final « Annulée ») tant
  qu'elle est « Envoyée » ou « En attente de validation administrative » ; une fois acceptée,
  il ne peut plus l'annuler et doit passer par le fil de discussion. L'employé affecté ou le
  responsable est notifié de l'annulation.
- Changement de configuration d'une catégorie (circuit, délais) alors que des demandes sont en
  cours : les demandes en cours conservent les règles en vigueur à leur création.
- Demande renvoyée « À corriger » plusieurs fois : chaque aller-retour est tracé dans
  l'historique.

## Requirements *(mandatory)*

### Functional Requirements

**Création de demandes**

- **FR-001**: Le système DOIT permettre à un utilisateur autorisé de créer une demande avec :
  titre (obligatoire), description écrite (facultative), message vocal (facultatif si une
  description est fournie), catégorie, destinataire, priorité (Normale, Moyenne, Haute,
  Urgente). La date et l'heure de création sont enregistrées automatiquement.
- **FR-002**: Le système DOIT exiger au moins un message vocal ou une description écrite pour
  envoyer une demande.
- **FR-003**: Le système DOIT permettre d'enregistrer une demande en « Brouillon » avant envoi,
  si cette option est activée.
- **FR-004**: En circuit direct, le système NE DOIT proposer comme destinataires que les
  utilisateurs actifs définis pour la catégorie choisie, et DOIT refuser côté serveur tout
  autre destinataire. La catégorie est donc choisie avant le destinataire.

**Messages vocaux**

- **FR-005**: Les utilisateurs DOIVENT pouvoir enregistrer un message vocal, le réécouter, le
  supprimer ou le refaire avant envoi.
- **FR-006**: Les utilisateurs autorisés DOIVENT pouvoir écouter les vocaux reçus sur
  smartphone, tablette et ordinateur, avec lecture, pause et déplacement dans
  l'enregistrement.
- **FR-007**: Le système DOIT appliquer une durée maximale et une taille maximale aux vocaux,
  paramétrables par le super administrateur, et avertir l'utilisateur à l'approche de la
  limite.
- **FR-008**: En cas d'échec d'envoi (vocal, message, pièce jointe ou demande), le système DOIT
  signaler l'échec à l'utilisateur, conserver le contenu non envoyé sur l'appareil et proposer
  de relancer l'envoi.

**Fil de discussion et pièces jointes**

- **FR-009**: Chaque demande DOIT disposer d'un fil de discussion accueillant des messages texte
  et vocaux ; chaque message affiche son auteur et sa date et heure.
- **FR-010**: Les participants autorisés DOIVENT pouvoir joindre des photos (prises avec
  l'appareil ou depuis la galerie) et des fichiers de formats autorisés, rattachés à la
  demande.
- **FR-011**: Le système DOIT refuser les pièces jointes d'un format non autorisé ou au-delà de
  la taille maximale, avec un message indiquant les formats et la taille acceptés.
- **FR-012**: Les messages, vocaux et pièces jointes envoyés NE DOIVENT PAS pouvoir être
  modifiés ni supprimés par les utilisateurs ; toute correction passe par un nouveau message.

**Statuts et transitions**

- **FR-013**: Une demande DOIT toujours avoir exactement un statut parmi : Brouillon, En attente
  de validation administrative, Envoyée, Acceptée, En cours, Terminée, En attente de validation
  finale, À corriger, Clôturée, Refusée, Annulée.
- **FR-014**: Le système DOIT n'autoriser que les transitions suivantes, chacune réservée aux
  rôles autorisés par la configuration :

  | De | Vers | Déclencheur |
  |----|------|-------------|
  | Brouillon | Envoyée | Demandeur (circuit A) |
  | Brouillon | En attente de validation administrative | Demandeur (circuit B) |
  | En attente de validation administrative | Envoyée | Responsable autorisé (approbation + affectation) |
  | En attente de validation administrative | Refusée | Responsable autorisé, avec motif obligatoire |
  | Envoyée | Acceptée | Employé affecté |
  | Envoyée | Refusée | Employé affecté, avec motif obligatoire |
  | Envoyée / En attente de validation administrative | Annulée | Demandeur |
  | Acceptée | En cours | Employé affecté |
  | En cours | Terminée | Employé affecté (photo jointe si la catégorie l'exige) |
  | Terminée | Clôturée | Automatique à l'expiration du délai de grâce, ou personne autorisée, selon la catégorie |
  | Terminée | En attente de validation finale | Automatique (catégorie avec validation finale) |
  | En attente de validation finale | Clôturée | Validateur autorisé |
  | Terminée / En attente de validation finale | À corriger | Demandeur ou validateur, avec commentaire obligatoire |
  | À corriger | En cours | Employé affecté |
  | Envoyée / Acceptée / En cours / À corriger | Envoyée | Responsable autorisé (réaffectation à un destinataire de la catégorie) |

- **FR-015**: Le système DOIT refuser toute autre transition, ainsi que toute transition tentée
  par un utilisateur non autorisé, et journaliser la tentative refusée.
- **FR-016**: Une demande « Clôturée », « Refusée » ou « Annulée » NE DOIT plus pouvoir changer
  de statut ; le motif de refus reste visible dans la demande et son historique.
- **FR-016a**: Le demandeur DOIT pouvoir annuler sa demande tant qu'elle est « Envoyée » ou
  « En attente de validation administrative » ; l'employé affecté ou les responsables
  concernés sont alors notifiés. Après acceptation, l'annulation NE DOIT plus être proposée.
- **FR-017**: Le passage à « Terminée » DOIT être bloqué tant qu'aucune photo n'est jointe, pour
  les catégories qui exigent une photo de preuve.

**Circuits par catégorie**

- **FR-018**: Chaque catégorie DOIT être configurée avec : circuit (A direct ou B avec
  validation administrative), liste des destinataires possibles (circuit A) ou des
  responsables valideurs (circuit B), mode de clôture (automatique ou par personne autorisée ;
  en mode automatique, la demande « Terminée » est clôturée après un délai de grâce
  paramétrable, 24 h par défaut, pendant lequel le demandeur peut la renvoyer « À corriger »),
  validation finale (oui/non, circuit B), mode d'affectation après approbation (manuel ou
  automatique, circuit B), photo de preuve obligatoire (oui/non).
- **FR-019**: En circuit B, une demande NE DOIT être visible d'aucun agent exécutant avant son
  approbation.
- **FR-020**: Le refus d'une demande, par un responsable en circuit B ou par l'employé affecté
  au statut « Envoyée », DOIT exiger un motif, faire passer la demande au statut final
  « Refusée » et notifier le demandeur avec ce motif. L'employé affecté NE DOIT PAS pouvoir
  transmettre lui-même la demande à un autre employé.
- **FR-021**: En circuit B à affectation automatique, le système DOIT affecter la demande selon
  une règle configurée pour la catégorie (par exemple un employé ou un responsable désigné).
- **FR-022**: Une modification de la configuration d'une catégorie NE DOIT s'appliquer qu'aux
  demandes créées après la modification.

**Délais**

- **FR-023**: Le système DOIT suivre séparément trois délais : validation administrative
  (de la soumission à la décision), prise en charge (de l'affectation à l'acceptation) et
  réalisation (de l'acceptation au passage à « Terminée »).
- **FR-024**: Les délais DOIVENT être paramétrables par catégorie et par priorité par une
  personne autorisée ; une catégorie et une priorité sans délai configuré ne sont pas suivies.
- **FR-025**: Le système DOIT afficher le temps restant pour l'étape en cours et signaler les
  demandes proches de l'échéance (seuil paramétrable) ou en retard.
- **FR-026**: À l'expiration d'un délai, le système DOIT marquer la demande « En retard » en
  précisant l'étape concernée, notifier le responsable concerné, et NE DOIT jamais supprimer ni
  masquer la demande automatiquement.
- **FR-027**: Le système DOIT permettre à un responsable autorisé de réaffecter une demande
  « Envoyée », « Acceptée », « En cours » ou « À corriger », en retard ou non, à un autre
  destinataire de la catégorie ; la demande repasse « Envoyée » pour le nouvel employé affecté
  et un nouveau délai de prise en charge démarre. Les règles d'escalade automatique sont hors du
  périmètre initial tant qu'elles ne sont pas définies.

**Horodatage et historique**

- **FR-028**: Le système DOIT horodater chaque étape : création, soumission, approbation ou
  refus, affectation, acceptation, début, fin, renvoi à corriger, validation finale, clôture.
- **FR-029**: Le système DOIT conserver pour chaque demande un historique complet et non
  modifiable : auteur, action, date et heure, valeur avant et après (statut, priorité,
  affectation, messages, pièces jointes).
- **FR-030**: Le système DOIT tenir un journal d'audit global (connexions, refus d'accès,
  modifications de comptes, de rôles, de permissions et de paramètres), consultable par le
  super administrateur uniquement.

**Notifications**

- **FR-031**: Le système DOIT notifier en temps réel, dans l'application uniquement (ni push ni
  e-mail dans ce lot) et sans rechargement de page, les
  utilisateurs concernés par : nouvelle demande, nouveau message, affectation, changement de
  statut, demande urgente, demande à corriger, refus, annulation, retard, clôture.
- **FR-032**: Les notifications liées aux demandes « Urgentes » DOIVENT être visuellement
  distinctes.
- **FR-033**: Les notifications non lues DOIVENT être conservées et présentées à l'utilisateur
  à sa prochaine connexion.

**Recherche et filtres**

- **FR-034**: Les utilisateurs DOIVENT pouvoir rechercher (par titre) et filtrer les demandes
  par statut, priorité, catégorie, destinataire, période et indicateur de retard, avec
  combinaison des filtres.
- **FR-035**: Les résultats de recherche NE DOIVENT contenir que des demandes auxquelles
  l'utilisateur a accès.

**Rôles, accès et confidentialité**

- **FR-036**: Le système DOIT gérer trois rôles : super administrateur (comptes, rôles,
  permissions, paramètres, journaux d'audit), administrateur/responsable (consulter,
  approuver/refuser, affecter, réaffecter, clôturer, dans son périmètre), employé (créer des
  demandes, recevoir et traiter celles qui lui sont affectées).
- **FR-037**: Les permissions détaillées (qui peut créer dans quelles catégories, changer la
  priorité, clôturer, valider) DOIVENT être paramétrables par le super administrateur, sans
  modification du produit ; « qui peut contacter qui » est déterminé par les destinataires de
  chaque catégorie (FR-004).
- **FR-038**: Une demande, son fil, ses vocaux et ses pièces jointes NE DOIVENT être accessibles
  qu'au demandeur, à l'employé affecté, aux responsables et validateurs de la catégorie et au
  super administrateur, avec vérification côté serveur à chaque accès, y compris par lien
  direct.
- **FR-039**: Un accès refusé NE DOIT pas révéler l'existence ni le contenu de la ressource, et
  DOIT être journalisé.
- **FR-040**: L'accès à l'application DOIT exiger une authentification ; les sessions DOIVENT
  expirer après une période d'inactivité.

**Utilisabilité**

- **FR-041**: Toutes les fonctions de ce lot DOIVENT être utilisables sur smartphone, tablette
  et ordinateur, sans perte de fonction essentielle.
- **FR-042**: Enregistrer un vocal, l'écouter, prendre une photo et changer un statut DOIVENT
  être accessibles en une seule action depuis l'écran de la demande, avec des libellés en
  langage courant.
- **FR-043**: L'interface DOIT respecter les WCAG 2.2 niveau AA, y compris des alternatives
  textuelles aux contrôles audio et un fonctionnement complet au clavier.
- **FR-044**: Les messages vocaux sont des contenus produits par les utilisateurs et ne
  disposent pas d'alternative textuelle dans ce lot (pas de transcription). Le titre
  obligatoire de chaque demande (FR-001) en donne l'objet sous forme de texte, et une
  déclaration de conformité partielle WCAG DOIT indiquer que le contenu audio des vocaux n'a
  pas d'alternative textuelle.

### Key Entities *(include if feature involves data)*

- **Utilisateur** : personne de l'école disposant d'un compte ; nom, fonction, rôle, état
  (actif ou désactivé).
- **Rôle et permission** : ensemble de droits attribués à un utilisateur ; détermine qui peut
  contacter qui et quelles actions sont permises par catégorie.
- **Catégorie** : type de demande (ex. « Photocopies ») ; circuit, destinataires possibles,
  mode de clôture, validation finale, mode d'affectation, photo obligatoire, responsables et
  validateurs associés.
- **Règle de délai** : délai de validation, de prise en charge et de réalisation pour un couple
  catégorie × priorité ; seuil d'alerte.
- **Demande** : titre, description, catégorie, priorité, demandeur, destinataire ou employé
  affecté, statut, horodatages de chaque étape, indicateurs de retard par étape.
- **Message** : élément du fil d'une demande ; auteur, date et heure, texte ou vocal.
- **Message vocal** : enregistrement audio rattaché à une demande ou à un message ; durée.
- **Pièce jointe** : photo ou fichier rattaché à une demande ou à un message ; nom, type,
  taille, auteur, date ; peut servir de preuve de réalisation.
- **Événement d'historique** : trace non modifiable d'une action sur une demande ; auteur,
  action, date et heure, valeurs avant et après.
- **Notification** : avis adressé à un utilisateur pour un événement ; type, demande liée,
  état lu ou non lu.
- **Entrée du journal d'audit** : trace non modifiable d'une action sensible hors demandes
  (connexion, refus d'accès, changement de paramètre).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un employé crée et envoie une demande vocale complète en moins de 60 secondes
  depuis un smartphone.
- **SC-002**: Lors d'un test d'utilisabilité, au moins 90 % des employés non techniques
  enregistrent, réécoutent et envoient leur première demande vocale sans aide.
- **SC-003**: Dans 95 % des cas, un destinataire ayant l'application ouverte voit la
  notification d'une nouvelle demande ou d'un changement de statut en moins de 5 secondes, sans
  recharger la page.
- **SC-004**: 100 % des transitions de statut, affectations, messages et pièces jointes
  apparaissent dans l'historique de la demande, avec auteur, date et heure.
- **SC-005**: 100 % des tentatives d'accès non autorisé à une demande, un vocal ou une pièce
  jointe sont bloquées et journalisées lors des tests de sécurité.
- **SC-006**: Une demande en dépassement est marquée « En retard » et le responsable est
  notifié dans les 30 secondes suivant l'échéance.
- **SC-007**: Aucune demande n'est perdue : 100 % des demandes dont l'envoi a échoué peuvent
  être renvoyées sans ressaisie.
- **SC-008**: Les parcours principaux (créer, écouter, prendre une photo, changer un statut)
  sont réalisables sur smartphone, tablette et ordinateur, et passent les vérifications
  d'accessibilité WCAG 2.2 AA.
- **SC-009**: Une recherche filtrée renvoie ses résultats en moins de 2 secondes pour un volume
  de 10 000 demandes.

## Assumptions

- Les utilisateurs sont uniquement des membres du personnel de l'école ; le rôle Parent est
  hors périmètre.
- L'école dispose d'une connexion internet ; un fonctionnement hors ligne complet n'est pas
  prévu, seule la conservation locale du contenu non envoyé l'est.
- Le contenu de l'interface est en français.
- En circuit B, le demandeur ne choisit pas l'agent exécutant : il choisit la catégorie, et la
  demande est soumise aux responsables de cette catégorie.
- Le délai de prise en charge court de l'affectation à l'acceptation ; le délai de réalisation
  court de l'acceptation au passage à « Terminée ». Après un renvoi « À corriger », un nouveau
  délai de réalisation démarre.
- Les vocaux ne sont pas transcrits ; la transcription automatique est hors périmètre.
- Un paramétrage initial (comptes, catégories, délais) est fourni à la mise en service.
- Les notifications de ce lot sont affichées dans l'application uniquement. Un utilisateur qui
  n'a pas l'application ouverte ne voit les demandes, y compris urgentes, qu'à sa prochaine
  ouverture ; le suivi des délais et le signalement « En retard » couvrent ce risque.
- Sont hors périmètre : gestion des absences, emplois du temps, réclamations, statistiques et
  tableaux de bord, import/export, transcription des vocaux, rôle Parent.

## Données personnelles

**Finalités** (principe IV de la constitution) :

- **Authentification** : identifiant, nom, fonction, rôle, mot de passe haché, sessions et
  adresse IP de connexion, pour contrôler l'accès à l'application.
- **Traitement des demandes** : contenu des demandes, messages texte, vocaux, photos et pièces
  jointes, pour formuler, réaliser et suivre les demandes de travail.
- **Traçabilité** : historique des demandes et journal d'audit (auteur, action, date et heure,
  valeurs avant et après), pour rendre les décisions vérifiables et détecter les accès non
  autorisés.

**Durées de conservation** — *hypothèses provisoires à faire valider par le client avant la
mise en production* :

| Données | Durée de conservation |
|---------|-----------------------|
| Vocaux, photos et pièces jointes | 12 mois après la clôture de la demande (ou son refus ou annulation) |
| Historique des demandes | 5 ans |
| Journaux d'audit | 5 ans |

La suppression automatique à l'échéance n'est pas réalisée dans ce lot.

## Points ouverts (à traiter en clarification)

Le client a demandé de ne pas trancher les points suivants dans cette spécification. Ils sont
couverts ci-dessus par des exigences paramétrables et seront traités par `/speckit-clarify` :

- Permissions détaillées (qui crée dans quelles catégories, qui change la priorité, qui
  clôture, qui valide) ; « qui contacte qui » est tranché par les destinataires de catégorie.
- Catégories nécessitant une validation administrative et/ou une validation finale.
- Valeurs des délais par catégorie et priorité (exemple non définitif : photocopies urgentes,
  prise en charge en 1 minute, réalisation en 5 minutes) et seuil « proche de l'échéance ».
- Action en cas de dépassement : règles d'escalade ou de réaffectation.
- Personnes à désigner comme destinataires de la catégorie « Photocopies » (paramétrage).
- Photo de preuve obligatoire ou non, par catégorie.
- Qui clôture (automatique, demandeur, responsable), par catégorie.
- Durée maximale, format et taille des vocaux ; formats et taille des pièces jointes.
- Accusé de lecture ou d'écoute des messages et vocaux.
- Validation des durées de conservation provisoires (section « Données personnelles »).
