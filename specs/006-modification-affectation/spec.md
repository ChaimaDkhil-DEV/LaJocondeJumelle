# Feature Specification: Modification d'une affectation par l'admin (classe, créneau)

**Feature Branch**: `006-modification-affectation`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Modification d'une affectation par un admin (ou le super
administrateur) : changer la classe et/ou le créneau (date, heure de début, heure de fin) d'une
affectation existante, au lieu de l'annuler puis d'en recréer une. Aujourd'hui : seules la
prolongation, la correction de l'enseignant et la réassignation existent ; l'enseignant peut
corriger son propre signalement seulement tant qu'il est « En attente ». Contraintes : la preuve
de présence est liée à la classe (QR code) ; un surveillant ne peut pas être sur deux créneaux qui
se chevauchent ; toute action d'admin est journalisée et ajoute un événement à l'historique ;
créneaux dans le fuseau de l'école, entre 12 h avant et 7 jours après maintenant ; mises à jour en
temps réel. Hors périmètre : modification du type, changement de surveillant (réassignation),
suppression (annulation motivée)."

## Clarifications

### Session 2026-10-22

- Q1 (statuts modifiables) → **B** : la **classe** n'est modifiable que dans les statuts « En
  attente », « Assignée », « En route » et « En retard ». Pendant la présence (« En cours »,
  « Relève demandée »), **seul le créneau** est modifiable, jamais la classe ; l'heure de début
  reste alors inchangée et la nouvelle heure de fin ne peut pas être antérieure à l'heure actuelle.
- Q2 (surveillant indisponible sur le nouveau créneau) → **A** : si le nouveau créneau chevauche une
  autre affectation du même surveillant, la modification est **refusée** avec un message clair qui
  **nomme l'affectation en conflit**. L'admin réaffecte d'abord, puis modifie. Pas de réaffectation
  dans le même formulaire.
- Q3 (classe changée pendant « En route ») → **A** : le statut **reste « En route »**. Le surveillant
  reçoit une notification qui **met en avant la nouvelle classe**, sans étape supplémentaire de sa
  part.

## Contexte

- Une erreur de classe ou d'horaire sur une affectation (signalement mal saisi, cours déplacé,
  absence plus courte que prévu) oblige aujourd'hui l'admin à **annuler** l'affectation puis à en
  **recréer** une : le surveillant reçoit une annulation puis une nouvelle affectation, l'historique
  est coupé en deux, et le signalement de l'enseignant n'est plus relié à l'affectation réelle.
- Existant à réutiliser, sans le modifier : prolongation (fin plus tardive), réassignation (autre
  surveillant, disponibilité revérifiée), correction de l'enseignant concerné, correction par
  l'enseignant de son propre signalement tant qu'il est « En attente ».
- Statuts d'une affectation : En attente (pas encore de surveillant) ; Assignée, En route, En
  retard (surveillant désigné, présence pas encore confirmée) ; En cours, Relève demandée
  (surveillant présent en classe) ; puis Terminée, Clôturée, Annulée, Non pourvue (définitifs).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Corriger le créneau d'une affectation (Priority: P1)

L'admin apprend que l'enseignante absente arrivera à 10 h 30 et non à 11 h. Il ouvre l'affectation,
choisit « Modifier », change l'heure de fin et enregistre. Le surveillant affecté est prévenu du
nouveau créneau ; l'historique de l'affectation garde l'ancien et le nouveau créneau.

**Why this priority**: c'est le cas le plus fréquent (durée mal estimée, cours décalé) ; la
prolongation ne couvre que l'allongement, pas l'avancement ni le décalage.

**Independent Test**: modifier le début et la fin d'une affectation assignée, vérifier le créneau
affiché à l'admin et au surveillant, la notification, l'historique et le journal d'audit.

**Acceptance Scenarios**:

1. **Given** une affectation modifiable (voir FR-002), **When** l'admin change la date, l'heure de
   début et/ou l'heure de fin et enregistre, **Then** le nouveau créneau s'affiche partout (détail,
   listes, « Mes affectations » du surveillant), sans changement de surveillant ni de statut
   (sauf FR-008).
2. **Given** la modification enregistrée, **Then** le surveillant affecté (s'il y en a un) reçoit
   une notification indiquant l'ancien et le nouveau créneau, et l'enseignant à l'origine du
   signalement (s'il y en a un) voit le nouveau créneau dans « Mes signalements ».
3. **Given** la modification, **Then** l'historique de l'affectation contient un événement
   « Affectation modifiée » avec les valeurs avant et après, et le journal d'audit une entrée
   « Affectation gérée par un admin » avec l'auteur, la date et les valeurs avant et après.
4. **Given** un nouveau créneau qui chevauche une autre affectation du même surveillant, **When**
   l'admin enregistre, **Then** la modification est refusée, rien n'est modifié, et un message clair
   nomme l'affectation en conflit (classe et créneau) ; l'admin réaffecte d'abord, puis modifie
   (aucune réaffectation dans le formulaire de modification).
5. **Given** un créneau invalide (fin avant le début, début hors de la fenêtre 12 h avant / 7 jours
   après, fin déjà passée), **When** l'admin enregistre, **Then** un message clair, relié au champ,
   l'indique et rien n'est modifié.
6. **Given** une affectation pendant la présence (« En cours », « Relève demandée »), **When** l'admin
   ouvre « Modifier », **Then** seule l'heure de fin est modifiable (classe, date et heure de début
   en lecture seule) et une heure de fin antérieure à l'heure actuelle est refusée.

---

### User Story 2 - Changer la classe d'une affectation (Priority: P2)

Le signalement indiquait « 2e année Bleu » par erreur : la classe concernée est « 1ère année
Violet ». L'admin modifie la classe ; le surveillant est prévenu de la nouvelle classe et la
présence se confirme désormais avec le QR code de la nouvelle classe.

**Why this priority**: moins fréquent que le créneau, mais aujourd'hui seul un signalement encore
« En attente » peut être corrigé (par l'enseignant) ; après assignation, rien n'est possible.

**Independent Test**: changer la classe d'une affectation assignée ; le surveillant voit la nouvelle
classe ; le QR code de l'ancienne classe est refusé, celui de la nouvelle accepté.

**Acceptance Scenarios**:

1. **Given** une affectation modifiable dont la présence n'est pas encore confirmée, **When** l'admin
   choisit une autre classe active et enregistre, **Then** la nouvelle classe (et son étage)
   s'affiche partout et le surveillant est notifié.
2. **Given** la classe modifiée, **When** le surveillant scanne le QR code de l'**ancienne** classe,
   **Then** la présence est refusée avec un message clair ; avec celui de la **nouvelle** classe,
   elle est acceptée.
3. **Given** une affectation dont la présence est déjà confirmée (En cours, Relève demandée),
   **Then** la classe n'est pas modifiable (le surveillant est déjà dans la classe) ; seule l'heure
   de fin l'est (US1 scénario 6).
4. **Given** le changement de classe d'une affectation « En route », **Then** l'affectation reste
   « En route » et le surveillant reçoit une notification qui met en avant la nouvelle classe ;
   aucune étape supplémentaire ne lui est demandée.

---

### Edge Cases

- **Affectation terminée, clôturée, annulée ou non pourvue** : aucune modification possible.
- **Aucun changement** (mêmes classe et créneau) : l'enregistrement est sans effet, sans
  notification ni événement.
- **Modification concurrente** (deux admins, ou le surveillant qui agit au même moment) : la
  seconde action est refusée avec un message expliquant que l'affectation a changé, et la page se
  recharge (comportement actuel des autres actions).
- **Classe désactivée** : non proposée ; une affectation existante dans une classe désactivée garde
  sa classe tant qu'elle n'est pas modifiée.
- **Affectation « En attente »** (signalement pas encore assigné) : modifiable par l'admin ; aucune
  disponibilité de surveillant à vérifier ; l'enseignant garde sa propre correction tant qu'elle
  est « En attente ».
- **Affectation en retard de prise en charge** (délais, rappels, escalade) : les délais sont
  recalculés à partir du nouveau créneau.
- **Doublons et renforts** : une modification ne fusionne ni ne sépare d'affectations ; les renforts
  présents restent rattachés (seulement possible avant présence pour la classe, donc sans renfort
  sur place).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Seuls les admins et le super administrateur DOIVENT pouvoir modifier une affectation ;
  le contrôle DOIT être fait par le serveur pour chaque requête, avec refus journalisé.
- **FR-002**: Ce qui est modifiable dépend du statut :
  - « En attente », « Assignée », « En route », « En retard » : classe, date, heure de début et
    heure de fin ;
  - « En cours », « Relève demandée » (présence confirmée) : **heure de fin seulement** ; la classe,
    la date et l'heure de début restent inchangées, et la nouvelle heure de fin NE DOIT PAS être
    antérieure à l'heure actuelle ;
  - « Terminée », « Clôturée », « Annulée », « Non pourvue » : aucune modification.
- **FR-003**: Dans les limites de FR-002, l'admin DOIT pouvoir modifier, ensemble ou séparément :
  la classe (parmi les classes actives), la date, l'heure de début et l'heure de fin, dans le
  fuseau de l'école.
- **FR-004**: Le créneau modifié DOIT respecter les règles de création : fin après le début, fin
  pas encore passée, début entre 12 h avant et 7 jours après le moment de la modification.
- **FR-005**: La classe NE DOIT être modifiable que dans les statuts « En attente », « Assignée »,
  « En route » et « En retard » ; jamais une fois la présence confirmée (« En cours », « Relève
  demandée »). Le serveur DOIT refuser toute tentative contraire.
- **FR-006**: La disponibilité du surveillant affecté DOIT être revérifiée sur le nouveau créneau
  (compte actif, ni absent ni indisponible, aucune autre affectation ou renfort qui chevauche). Si
  elle échoue, la modification DOIT être refusée sans rien changer, avec un message qui nomme
  l'affectation en conflit (classe et créneau) ; aucune réaffectation n'est proposée dans le
  formulaire de modification.
- **FR-007**: Après une modification, le surveillant affecté DOIT être notifié (ancien et nouveau
  créneau et/ou classe ; un changement de classe est mis en avant dans la notification), ainsi que
  les autres admins ; l'enseignant à l'origine du signalement DOIT
  voir les nouvelles valeurs dans « Mes signalements ». Les mises à jour DOIVENT apparaître en temps
  réel pour les personnes qui consultent l'affectation.
- **FR-008**: Le statut DOIT rester inchangé, y compris « En route » après un changement de classe
  (aucune étape supplémentaire pour le surveillant).
- **FR-009**: Après un changement de classe, la confirmation de présence DOIT exiger le QR code de
  la nouvelle classe.
- **FR-010**: Chaque modification DOIT ajouter un événement « Affectation modifiée » à l'historique
  de l'affectation et une entrée au journal d'audit (auteur, date et heure, valeurs avant et après) ;
  le motif de l'absence, visible des admins seulement, reste inchangé et n'est pas journalisé.
- **FR-011**: Les délais de prise en charge, rappels et escalades DOIVENT être recalculés à partir
  du nouveau créneau.
- **FR-012**: Une modification concurrente DOIT être détectée et refusée sans perte : message
  explicite et rechargement de l'affectation.
- **FR-013**: Le formulaire de modification DOIT respecter les WCAG 2.2 AA (clavier, libellés,
  erreurs reliées aux champs, confirmation annoncée) et tenir en 320 px de large.

### Key Entities *(include if feature involves data)*

- **Affectation** (existante) : classe (et étage copié), début, fin prévue, statut, surveillant
  affecté, enseignant concerné, motif. La modification change classe, étage, début et fin prévue,
  rien d'autre.
- **Événement d'historique** (existant) : nouvel événement « Affectation modifiée » avec les valeurs
  avant et après.
- **Entrée du journal d'audit** (existante) : action « Affectation gérée par un admin » pour la
  modification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Corriger la classe ou le créneau d'une affectation prend une seule opération
  (« Modifier » puis « Enregistrer »), au lieu d'une annulation suivie d'une recréation.
- **SC-002**: Après une modification, le surveillant affecté voit la nouvelle classe et le nouveau
  créneau en moins de 5 secondes, sans recharger la page.
- **SC-003**: 100 % des modifications enregistrées apparaissent dans l'historique de l'affectation
  et dans le journal d'audit avec les valeurs avant et après.
- **SC-004**: 0 affectation modifiée ne place un surveillant sur deux créneaux qui se chevauchent.
- **SC-005**: Aucune violation d'accessibilité détectée par l'audit automatique sur le formulaire
  de modification, à 320 px et sur desktop.

## Assumptions

- Modifier = corriger la même affectation (même référence, même historique) ; le surveillant et le
  type (retard, absence, classe vide) ne changent pas. Pour changer de surveillant, la
  réassignation existante s'applique.
- La prolongation existante reste disponible et inchangée ; la modification couvre aussi
  l'avancement et le décalage du créneau.
- La correction par l'enseignant de son signalement « En attente » reste inchangée.
- Notifications dans l'application uniquement (pas d'e-mail ni de SMS), comme le reste du module.
- Le motif d'absence n'est pas modifiable par cette fonctionnalité.
