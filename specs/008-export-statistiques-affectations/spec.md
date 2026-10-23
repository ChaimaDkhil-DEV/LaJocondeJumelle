# Feature Specification: Export des statistiques des affectations

**Feature Branch**: `008-export-statistiques-affectations`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Export des statistiques des affectations (/gardes/statistiques) :
aujourd'hui la page des statistiques des affectations des surveillants n'a aucun export (écart
§4.3 de docs/superadmin-fonctionnalites.md). Permettre à l'administration d'exporter ces
statistiques."

## Clarifications

### Session 2026-10-23

- Q: Chaque export réussi doit-il être journalisé dans le journal d'audit (auteur, date et heure,
  période, regroupement) ? → A : **A**, oui ; seulement pour cet export (les exports du tableau
  de bord et du suivi des gardes restent inchangés).

## Contexte

- La page « Statistiques des affectations » (Gardes › Statistiques) affiche, pour une période
  (« Du », « Au ») choisie dans le fuseau de l'école : les totaux (retards et absences, retards,
  absences, classes vides, non pourvues, taux de non pourvue, durée moyenne), les éléments
  comptés à part (annulées, doublons non tranchés) et un tableau regroupé par enseignant, par
  classe ou par période (semaine ou mois).
- Elle est réservée à l'admin et au super administrateur (statistiques par enseignant, spec 004
  FR-022 et FR-023). La spec 004 l'a livrée « sans export » ; l'export des statistiques y était
  hors périmètre. C'est le seul écart restant sur cette page (inventaire du super administrateur,
  §4.3).
- L'application exporte déjà au format tableur deux autres vues : le tableau de bord des demandes
  et le suivi des gardes. Les fichiers s'ouvrent directement dans un tableur courant (séparateur,
  accents, protection contre les formules).
- Besoin : remettre ces statistiques à la direction ou les retravailler dans un tableur, sans les
  recopier à la main.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exporter les statistiques affichées (Priority: P1)

Un admin ouvre « Statistiques des affectations », choisit la période et le regroupement, puis
clique sur « Exporter en CSV ». Il obtient un fichier qui contient exactement ce que la page
affiche : la période, les totaux, les éléments comptés à part et le tableau du regroupement choisi.

**Why this priority**: c'est tout le besoin ; sans lui, les chiffres se recopient à la main.

**Independent Test**: avec des affectations connues sur une période, exporter en regroupement
« Enseignant », ouvrir le fichier dans un tableur et comparer chaque valeur à la page.

**Acceptance Scenarios**:

1. **Given** un admin sur la page, période du 1er au 23 octobre, regroupement « Enseignant »,
   **When** il clique sur « Exporter en CSV », **Then** un fichier est téléchargé et son nom
   indique le regroupement et la période (par ex. `statistiques-affectations-enseignant-2026-10-01-au-2026-10-23.csv`).
2. **Given** ce fichier ouvert dans un tableur, **When** on le lit, **Then** il contient la période
   et le fuseau de l'école, une ligne par enseignant avec les mêmes colonnes et les mêmes valeurs
   que le tableau (événements, retards, absences, classes vides, non pourvues, annulées, durée
   moyenne), puis les totaux de la période et les éléments comptés à part, avec les mêmes valeurs
   que la page.
3. **Given** le regroupement « Période » par semaine (ou par mois), **When** il exporte, **Then**
   le fichier contient une ligne par semaine (ou par mois), avec le même libellé que la page.
4. **Given** le regroupement « Classe », **When** il exporte, **Then** le fichier contient une
   ligne par classe.
5. **Given** un enseignant anonymisé (au bout d'une année scolaire, spec 004 FR-023a), **When** il
   exporte, **Then** la ligne porte le même libellé anonyme que la page, jamais le nom.
6. **Given** des accents, des apostrophes ou un nom commençant par « = », « + », « - » ou « @ »,
   **When** le fichier est ouvert dans un tableur, **Then** le texte s'affiche à l'identique et
   aucune formule ne s'exécute.

---

### User Story 2 - Accès réservé et état de la page (Priority: P1)

L'export suit les mêmes règles que la page : seuls l'admin et le super administrateur peuvent
l'obtenir, et seulement pour une période valide.

**Why this priority**: les statistiques par enseignant sont des données personnelles réservées
(spec 004 FR-023) ; un export ouvert à d'autres rôles serait une fuite.

**Independent Test**: demander l'export avec un compte surveillant ou enseignant, puis avec une
période invalide.

**Acceptance Scenarios**:

1. **Given** un utilisateur qui n'est ni admin ni super administrateur, **When** il demande
   l'export, même directement par son adresse, **Then** il est refusé de la même façon que la page
   des statistiques (réponse « introuvable »), et le refus est journalisé.
2. **Given** une période dont « Du » est après « Au », ou plus longue que la limite de la page,
   **When** l'export est demandé, **Then** il est refusé avec le même message que la page et aucun
   fichier n'est produit.
3. **Given** une date incomplète ou en cours de saisie, ou un calcul en cours ou en erreur,
   **When** la page s'affiche, **Then** « Exporter en CSV » n'est pas proposé.
4. **Given** une période sans aucune affectation, **When** il exporte, **Then** le fichier contient
   l'en-tête, la période et des totaux à zéro, sans ligne de détail.
5. **Given** un export réussi, **When** le super administrateur ouvre le journal d'audit, **Then**
   il y trouve une entrée « Export des statistiques des affectations » avec l'auteur, la date et
   l'heure, la période et le regroupement, sans valeur statistique ni nom d'enseignant.

---

### Edge Cases

- Durée moyenne non calculable (aucune affectation terminée) : cellule vide, comme le « — » de la
  page.
- Taux de non pourvue : exporté en pourcentage entier, comme sur la page (par ex. « 12 % »).
- Filtres modifiés après le dernier calcul : l'export porte toujours sur les filtres affichés,
  jamais sur un résultat précédent (pas d'export pendant le recalcul).
- Données modifiées entre l'affichage et l'export (une affectation terminée entre-temps) : le
  fichier reflète l'état au moment de l'export, comme un rechargement de la page.
- Écran de 320 px : le bouton reste visible et atteignable au clavier, sans défilement horizontal
  de la page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La page « Statistiques des affectations » DOIT proposer une action « Exporter
  (CSV) » qui télécharge un fichier des statistiques pour la période et le regroupement affichés
  (et, pour « Période », la granularité semaine ou mois).
- **FR-002**: Le fichier DOIT contenir : la période (« Du », « Au ») et le fuseau de l'école ; une
  ligne par élément du regroupement, avec les colonnes du tableau de la page dans le même ordre et
  avec les mêmes libellés ; les totaux de la période (les sept indicateurs de la page) ; les
  éléments comptés à part (annulées, doublons non tranchés).
- **FR-003**: Chaque valeur exportée DOIT être identique à celle affichée par la page pour les
  mêmes filtres au même moment (mêmes règles de calcul, même fuseau, mêmes libellés, y compris le
  libellé des enseignants anonymisés et des affectations sans enseignant).
- **FR-004**: Le fichier DOIT suivre le format des exports existants de l'application : ouverture
  directe dans un tableur courant, accents conservés, et neutralisation des valeurs qui pourraient
  être interprétées comme des formules.
- **FR-005**: Le nom du fichier DOIT indiquer le regroupement et la période.
- **FR-006**: L'export DOIT être réservé à l'admin et au super administrateur, avec la même
  vérification côté serveur que la page des statistiques ; tout autre utilisateur DOIT recevoir la
  même réponse que pour la page (« introuvable ») et le refus DOIT être journalisé.
- **FR-007**: L'export DOIT appliquer les mêmes contrôles de période que la page (« Du » au plus
  tard « Au », durée maximale) et refuser une demande invalide avec le même message.
- **FR-008**: L'action d'export NE DOIT être proposée que lorsque les statistiques des filtres
  affichés sont calculées et affichées (ni pendant la saisie d'une date incomplète, ni pendant un
  calcul, ni après une erreur).
- **FR-009**: Chaque export réussi DOIT être tracé dans le journal d'audit non modifiable : auteur,
  date et heure, période (« Du », « Au »), regroupement et, pour « Période », la granularité ;
  sans aucune valeur statistique ni nom d'enseignant. L'entrée DOIT être consultable dans le
  journal d'audit de l'administration avec un libellé explicite (par ex. « Export des
  statistiques des affectations »). Un export refusé (FR-006, FR-007) n'est pas tracé comme
  export réussi. Les exports du tableau de bord et du suivi des gardes ne changent pas.
- **FR-010**: L'action DOIT respecter les règles d'accessibilité du projet (libellé explicite,
  atteignable et activable au clavier, focus visible) et rester utilisable à 320 px.

### Key Entities *(include if feature involves data)*

- **Export des statistiques**: fichier produit à la demande, non conservé par l'application ;
  contient la période, le regroupement, les lignes du tableau, les totaux et les éléments comptés
  à part. Aucune donnée nouvelle : il reprend les statistiques de la page (spec 004, FR-022).
- **Entrée d'audit « export des statistiques »**: nouvelle action du journal d'audit existant ;
  auteur, date et heure, période, regroupement (et granularité) ; aucune donnée statistique.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un admin obtient le fichier des statistiques affichées en 1 action depuis la page.
- **SC-002**: 100 % des valeurs du fichier (lignes, totaux, comptés à part) sont identiques à
  celles de la page pour les mêmes filtres, pour chacun des trois regroupements et les deux
  granularités de période.
- **SC-003**: Le fichier s'ouvre dans un tableur courant sans manipulation (colonnes séparées,
  accents corrects) et aucune valeur ne s'y exécute comme formule.
- **SC-004**: 0 export obtenu par un utilisateur qui n'est ni admin ni super administrateur ; 100 %
  des tentatives refusées et 100 % des exports réussis sont journalisés.
- **SC-005**: Aucune violation d'accessibilité détectée par l'audit automatique sur la page des
  statistiques avec l'action d'export, à 320 px et sur desktop.

## Assumptions

- Même public que la page : l'admin et le super administrateur (spec 004 FR-022, FR-023) ; aucun
  nouveau rôle ni réglage. Le journal d'audit reste consultable par le super administrateur
  seulement, comme aujourd'hui.
- Format CSV seul, comme les deux exports existants ; pas de PDF ni de classeur tableur natif.
  L'impression de la page reste celle du navigateur.
- Un fichier exporte la vue affichée (un regroupement) ; pas d'export groupé des trois
  regroupements ni de liste détaillée des affectations (le suivi des gardes l'exporte déjà).
- Aucune règle de calcul nouvelle : l'export réutilise les statistiques de la page telles quelles.
- Le fichier n'est pas conservé par l'application ; sa conservation relève de celui qui le
  télécharge. Les données exportées sont celles déjà visibles par ce même utilisateur
  (minimisation : aucune colonne de plus que la page, pas de motif détaillé).
