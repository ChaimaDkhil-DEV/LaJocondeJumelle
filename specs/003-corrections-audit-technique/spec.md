# Feature Specification: Corrections issues de l'audit technique

**Feature Branch**: `003-corrections-audit-technique`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Corriger les incohérences et faiblesses techniques identifiées dans
docs/ARCHITECTURE.md, en particulier les sections 7 « Incohérences constatées » et 10 « Faiblesses
d'architecture ». Utiliser ce rapport comme source principale sans refaire l'audit depuis zéro.
Conserver les distinctions [VÉRIFIÉ] et [DÉDUIT]. Le périmètre couvre la configuration du port
3002, la sécurité, les tests, les dépendances entre modules, l'affectation automatique et FR-022,
ainsi que la préparation à la production. Ne pas considérer les décisions métier non validées comme
des exigences définitives. Distinguer les corrections techniques réalisables des décisions
nécessitant une validation humaine."

## Source et méthode

- **Source unique** : `docs/ARCHITECTURE.md` (analyse du 2026-10-15, branche
  `002-refonte-ui-destinataires`, commit `595c3fc`), en particulier §7 « Incohérences
  constatées », §8, §9, §10 « Faiblesses d'architecture » et §11 « Ce que je dois vérifier
  moi-même ». L'audit n'est **pas** refait ; chaque exigence renvoie au constat qui la justifie.
- **Marquage repris tel quel** :
  - **[VÉRIFIÉ]** : constat lu dans le code, la configuration ou le résultat d'une commande ;
  - **[DÉDUIT]** : interprétation non prouvée. Une exigence fondée sur un constat [DÉDUIT] DOIT
    d'abord confirmer le constat (test ou mesure) avant toute correction.
- **Mise à jour depuis l'audit** : les trois modifications « non commitées » citées par l'audit
  (port 3002 dans `config.ts`, `vite.config.ts`, `frontend/package.json`) et `start.bat` ont été
  commitées le 2026-10-15 (`1e6d4ee`) ; `docs/ARCHITECTURE.md` l'a été dans `eafa1e6`. Les
  constats restent valables : le test `config.spec.ts` échoue toujours (vérifié après commit).
- **Classement de chaque constat** :
  - **CT** — correction technique réalisable sans décision métier ;
  - **DH** — décision nécessitant une validation humaine (établissement ou responsable du projet) ;
  - **HP** — hors périmètre de cette fonctionnalité (consigné, non traité).

### Registre des constats

| ID | Constat (résumé) | Source | Marquage | Classe |
|----|------------------|--------|----------|--------|
| A01 | Le port par défaut de l'API en développement est 3002, mais l'exemple de configuration, le README, le proxy HTTPS de développement et un test unitaire indiquent encore 3000 ; ce test échoue | §7.8, §9, §11.2 | [VÉRIFIÉ] | CT |
| A02 | Le lanceur de développement démarre la version **compilée** de l'API (pas de rechargement, compilation préalable obligatoire), alors que le README recommande le mode avec rechargement | §7.9, §9 | [VÉRIFIÉ] | CT |
| A03 | En circuit B, l'affectation automatique lit la configuration **actuelle** de la catégorie à l'approbation, et non la règle figée à la soumission | §7.1 | [VÉRIFIÉ] | DH (règle) puis CT |
| A04 | Conséquence : un changement de mode d'affectation entre soumission et approbation s'applique aux demandes déjà soumises | §7.1 | [DÉDUIT] | à confirmer par un test |
| A05 | Le script de réinitialisation du mot de passe du super administrateur ne journalise pas l'action et ne ferme pas ses sessions | §10 Exploitation, §11.7 | [VÉRIFIÉ] | DH (garder ou supprimer) puis CT |
| A06 | Les listes de clés sensibles masquées diffèrent entre journaux applicatifs et journal d'audit (`authorization` absent de l'audit, `message` absent des journaux) | §10 Code dupliqué | [VÉRIFIÉ] | CT |
| A07 | Le réglage de confiance envers le proxy et le port sont lus hors de la validation de configuration au démarrage | §8, §10 Responsabilités | [VÉRIFIÉ] | CT |
| A08 | Le contrôle d'origine est écrit deux fois (requêtes HTTP et connexions temps réel) | §10 Code dupliqué | [VÉRIFIÉ] | CT |
| A09 | Cycles d'import entre domaines : demandes ↔ fichiers, authentification ↔ demandes, socle commun ↔ audit et ↔ authentification ; un module de contournement existe pour un cycle | §10 Couplages | [VÉRIFIÉ] | CT |
| A10 | Le stockage de fichiers connaît la politique d'accès de chaque domaine métier (demandes et couverture de classe) | §10 Couplages | [VÉRIFIÉ] | CT |
| A11 | Tout nouveau type de ressource avec fichiers obligera à modifier le service de fichiers | §10 Couplages | [DÉDUIT] | CT (conséquence de A10) |
| A12 | Règles transverses (permissions par rôle, droits d'administration et d'audit) rangées dans la politique d'accès du domaine des demandes | §10 Responsabilités | [VÉRIFIÉ] | CT |
| A13 | Le chargeur de règles de catégorie est déclaré dans 5 modules au lieu d'être partagé | §7.2 | [VÉRIFIÉ] | CT |
| A14 | Impact de A13 faible (service sans état) | §7.2 | [DÉDUIT] | — |
| A15 | Le job de délais de la couverture de classe est rangé hors du dossier des tâches planifiées | §7.3 | [VÉRIFIÉ] | CT |
| A16 | Publicateur de notifications « sans effet » exporté mais inutilisé, commentaire périmé | §7.4 | [VÉRIFIÉ] | CT |
| A17 | Types du frontend écrits à la main ; le fichier de types générés annoncé n'existe pas ; les énumérations sont dupliquées entre serveur et interface | §7.5, §10 Code dupliqué | [VÉRIFIÉ] | CT |
| A18 | Dépendance d'icônes déclarée mais jamais importée | §7.6 | [VÉRIFIÉ] | CT |
| A19 | Deux scripts d'exploitation ne respectent pas la convention de formatage du projet | §7.7 | [VÉRIFIÉ] | CT |
| A20 | Tests d'intégration, de bout en bout et lint non exécutés par l'audit | §10 Testabilité, §11.3, §11.4 | [DÉDUIT] (non lancés) | CT |
| A21 | Aucune intégration continue dans le dépôt ; déploiements manuels | §9 | [VÉRIFIÉ] / [DÉDUIT] | DH |
| A22 | Migrations appliquées automatiquement à chaque démarrage, sans sauvegarde imposée techniquement | §10 Exploitation | [VÉRIFIÉ] | CT |
| A23 | Une migration défectueuse empêcherait l'API de démarrer sans étape intermédiaire | §10 Exploitation | [DÉDUIT] | CT (à couvrir par la procédure) |
| A24 | Restauration des sauvegardes jamais vérifiée | §11.8 | [DÉDUIT] (non testé) | CT |
| A25 | CSP, HSTS et limite de taille configurées mais non vérifiées sur un déploiement réel | §11.12 | [DÉDUIT] (non testé) | CT |
| A26 | Objectifs de performance couverts par des tests non exécutés par l'audit | §11.9 | [DÉDUIT] (non lancés) | CT |
| A27 | Aucune purge automatique des données personnelles ; durées de conservation provisoires | §10 Exploitation, §11.10 | [VÉRIFIÉ] | DH |
| A28 | Une seule instance d'API possible (état en mémoire) | §10 Exploitation | [VÉRIFIÉ] | HP (assumé par le plan du lot 1) |
| A29 | Deux machines à états, deux politiques d'accès, deux calculs et jobs de délais (lot 1 et lot 2) | §10 Code dupliqué | [VÉRIFIÉ] | HP |
| A30 | Services volumineux (couverture de classe, demandes) | §10 Responsabilités | [VÉRIFIÉ] | HP |
| A31 | Six modules globaux masquent les dépendances réelles | §10 Couplages | [VÉRIFIÉ] / [DÉDUIT] | HP |
| A32 | Lot 2 (couverture de classe) sans spécification | §11.5 | [VÉRIFIÉ] | DH / HP |
| A33 | Aucun outil de suivi d'erreurs ni métrique | §8 | [DÉDUIT] | HP |
| A34 | `embedded-postgres` en version bêta (développement et tests uniquement) | §10 Exploitation | [VÉRIFIÉ] | HP |
| A35 | Validations manuelles (iPhone réel, test d'utilisabilité) non faites | §11.11 | [VÉRIFIÉ] | HP (tâches T119, T120 du lot 1) |

## Clarifications

### Session 2026-10-15

- Q: Quelle règle d'affectation automatique appliquer quand la catégorie change entre la
  soumission et l'approbation (D1) ? → A: tout est figé à la soumission, mode **et** personne
  désignée, conformément à la lettre de FR-022 (lot 1) ; si la personne figée n'est plus
  affectable, l'approbation sans employé choisi est refusée (FR-011). Les deux seules exceptions,
  EXC-1 et EXC-2 de FR-008, ont été tranchées ensuite (D9 et D8, session suivante).
- Q: Que faire de l'outil de réinitialisation du mot de passe du super administrateur (D2) ?
  → A: l'intégrer comme sous-commande de l'outil d'initialisation existant, qui journalise déjà
  dans l'audit ; le script séparé est supprimé.
- Q: Comment rejouer les contrôles qualité avant chaque livraison (D3) ? → A: intégration
  continue automatique pour le lint et les tests unitaires, d'interface et d'intégration ;
  exécution manuelle consignée pour les tests de bout en bout et de performance.

### Session 2026-10-15 (2) — suite de `/speckit-analyze` (constat I1)

- Q: Quand la personne figée à la soumission n'est plus affectable à l'approbation (compte
  désactivé, ou retirée des destinataires de la catégorie), que se passe-t-il après le refus
  (D8) ? → A: le refus `AUTO_ASSIGNEE_UNAVAILABLE` est d'abord renvoyé ; le responsable peut
  ensuite approuver en choisissant lui-même un employé affectable ; l'historique trace ce choix.
- Q: Pour les demandes soumises avant la correction, dont le snapshot ne contient pas la personne
  désignée, quelle règle appliquer à l'approbation (D9) ? → A: la personne désignée est lue
  dans la configuration actuelle de la catégorie (comportement actuel), et l'historique l'indique.

## User Scenarios & Testing *(mandatory)*

Les acteurs sont : le **développeur** qui installe et fait évoluer le projet, l'**exploitant** qui
déploie et sauvegarde l'application, le **super administrateur**, et les **utilisateurs** des
catégories en circuit B (demandeurs, responsables, employés affectés).

### User Story 1 - Démarrer et tester le projet sans incohérence de port (Priority: P1)

Un développeur récupère le dépôt, suit le README, copie la configuration d'exemple et démarre
l'application. L'interface joint l'API du premier coup, sur le port de développement 3002, et la
suite de tests complète passe.

**Why this priority**: aujourd'hui un test échoue (A01) et la constitution interdit de fusionner
quoi que ce soit tant que la suite est rouge (principe I). Tout le reste de la fonctionnalité en
dépend.

**Independent Test**: sur un poste propre, suivre uniquement le README, puis lancer toutes les
suites de tests ; aucun fichier ne doit être modifié à la main.

**Acceptance Scenarios**:

1. **Given** un poste sans configuration locale, **When** le développeur copie l'exemple de
   configuration sans le modifier (hors secret) et démarre l'API puis l'interface, **Then**
   l'interface affiche la page de connexion et ses appels à l'API aboutissent.
2. **Given** le proxy HTTPS de développement (test du micro sur téléphone), **When** il est
   démarré, **Then** il relaie les appels à l'API vers le port 3002, comme le proxy de
   l'interface.
3. **Given** la configuration du projet, **When** la suite unitaire s'exécute, **Then** le test
   de configuration vérifie la valeur par défaut 3002 et passe.
4. **Given** le lanceur Windows, **When** le développeur l'utilise après une modification du
   code serveur, **Then** la modification est prise en compte sans étape de compilation manuelle
   (A02), ou le README indique explicitement l'étape requise.
5. **Given** l'environnement de production, **When** l'API démarre dans son conteneur, **Then**
   elle écoute sur le port explicitement fixé par le déploiement, sans dépendre de la valeur par
   défaut de développement.

---

### User Story 2 - Garantir la traçabilité et la sécurité des opérations sensibles (Priority: P1)

L'exploitant peut réinitialiser l'accès du super administrateur en cas de perte de mot de passe,
et cette opération est tracée comme toute autre action d'administration. Les journaux ne laissent
fuir aucun secret, quelle que soit leur destination, et les mêmes contrôles d'origine
s'appliquent à toutes les voies d'entrée.

**Why this priority**: la constitution (principe V) exige que toute action d'administration soit
tracée de façon non modifiable ; le script actuel la contourne (A05). Les écarts de masquage
(A06) et de configuration non validée (A07) touchent directement la protection des données
(principe IV).

**Independent Test**: exécuter la réinitialisation sur une base de test et vérifier le journal
d'audit et les sessions ; injecter des valeurs sensibles dans les deux types de journaux ;
démarrer l'API avec une configuration de proxy invalide.

**Acceptance Scenarios**:

1. **Given** un super administrateur avec deux sessions ouvertes, **When** l'exploitant
   réinitialise son mot de passe par la sous-commande de l'outil d'initialisation (FR-010), **Then** une
   entrée d'audit non modifiable est créée (action, cible, date, origine « outil
   d'exploitation »), les deux sessions sont fermées et le compte doit changer son mot de passe
   à la connexion suivante.
2. **Given** un événement contenant un en-tête d'autorisation, un mot de passe, un jeton ou le
   contenu d'un message, **When** il est écrit dans les journaux applicatifs ou dans le journal
   d'audit, **Then** ces valeurs sont masquées dans les deux.
3. **Given** une valeur de confiance envers le proxy ou un port invalide, **When** l'API
   démarre, **Then** elle refuse de démarrer avec un message explicite, comme pour les autres
   variables obligatoires.
4. **Given** une requête modifiante ou une connexion temps réel provenant d'une origine
   étrangère, **When** elle arrive, **Then** elle est refusée par une règle d'origine unique,
   identique pour les deux voies, et le refus est journalisé.

---

### User Story 3 - Affectation automatique conforme à la règle des snapshots (Priority: P2)

Un responsable approuve, en circuit B, une demande soumise dans une catégorie à affectation
automatique. Le mode d'affectation **et** la personne désignée sont ceux figés à la soumission
(décision D1, FR-022 du lot 1), même si l'administrateur a modifié la catégorie entre la
soumission et l'approbation. Seules deux exceptions s'appliquent (FR-008) : **EXC-1**, une
demande soumise avant la correction, dont le snapshot ne contient pas la personne désignée, est
affectée selon la catégorie actuelle (décision D9) ; **EXC-2**, si la personne figée n'est plus
affectable, l'approbation est refusée puis le responsable choisit un employé affectable
(décision D8, FR-011).

**Why this priority**: écart [VÉRIFIÉ] avec une exigence écrite (FR-022 du lot 1), mais il ne se
produit que si la configuration d'une catégorie change pendant qu'une demande attend son
approbation.

**Independent Test**: soumettre une demande, modifier le mode ou la personne d'affectation de la
catégorie, approuver, puis vérifier la personne affectée.

**Acceptance Scenarios**:

1. **Given** une demande soumise quand la catégorie désignait l'employé E1, **When**
   l'administrateur désigne E2 puis le responsable approuve, **Then** la demande est affectée
   à E1 (personne figée à la soumission).
2. **Given** une demande soumise en affectation automatique, **When** l'administrateur passe la
   catégorie en affectation manuelle avant l'approbation, **Then** la demande est quand même
   affectée automatiquement à la personne figée à la soumission.
3. **Given** la personne figée à la soumission n'est plus affectable à l'approbation (compte
   désactivé ou retiré des destinataires de la catégorie), **When** le responsable approuve sans
   choisir d'employé, **Then** l'approbation est refusée avec un message l'invitant à choisir
   l'employé, sans rien modifier ; **When** il approuve ensuite en choisissant un employé
   affectable, **Then** la demande est affectée à cet employé (décision D8).
4. **Given** une demande soumise avant la correction, dont le snapshot ne contient pas la
   personne désignée, **When** le responsable approuve, **Then** la demande est affectée à la
   personne désignée dans la catégorie actuelle (décision D9).
5. **Given** l'affectation effectuée, **When** on consulte l'historique de la demande, **Then**
   l'événement d'affectation créé par l'approbation indique la personne affectée et sa source :
   snapshot, catégorie actuelle (EXC-1, D9) ou choix du responsable (mode manuel, ou EXC-2, D8).

---

### User Story 4 - Des dépendances internes lisibles et vérifiées automatiquement (Priority: P2)

Un développeur qui ajoute une fonctionnalité peut identifier les dépendances réelles entre
domaines ; aucune boucle de dépendance n'existe entre les domaines cités par l'audit, et une
vérification automatique empêche d'en réintroduire. Le code mort et les doublons signalés ont
disparu, et toute divergence entre les statuts connus du serveur et ceux de l'interface est
détectée avant livraison.

**Why this priority**: améliore la maintenabilité sans changer le comportement visible ; doit
suivre US1 (suite verte) pour que la non-régression soit prouvable.

**Independent Test**: lancer la vérification automatique des dépendances et la suite complète ;
comparer le comportement fonctionnel avant et après (aucun test fonctionnel modifié dans son
attendu).

**Acceptance Scenarios**:

1. **Given** le code après correction, **When** la vérification des dépendances s'exécute,
   **Then** elle ne trouve aucun cycle entre les domaines demandes, fichiers, authentification,
   audit et socle commun. La séparation du module temps réel (registre des connexions d'un
   côté, passerelle authentifiée de l'autre) est conservée et documentée comme un découpage
   voulu, non comme un contournement (voir research R7).
2. **Given** un développeur qui introduit volontairement un cycle entre ces domaines, **When** la
   vérification s'exécute, **Then** elle échoue en nommant les fichiers concernés.
3. **Given** un fichier joint à une demande ou une preuve de présence de la couverture de
   classe, **When** un utilisateur tente de le lire, **Then** les décisions d'accès sont
   identiques à celles d'avant la correction (mêmes autorisations, mêmes refus journalisés), et
   le stockage de fichiers ne contient plus de règle propre à un domaine métier.
4. **Given** un statut ajouté ou renommé côté serveur, **When** les contrôles de qualité
   s'exécutent, **Then** ils échouent tant que l'interface ne connaît pas ce statut.
5. **Given** le dépôt, **When** on recherche le publicateur de notifications inutilisé, la
   dépendance d'icônes inutilisée ou les déclarations multiples du chargeur de règles, **Then**
   on n'en trouve plus, et les scripts d'exploitation respectent la convention de formatage.

---

### User Story 5 - Mettre en production en sécurité (Priority: P3)

L'exploitant dispose d'une procédure de mise en production vérifiée : une sauvegarde est garantie
avant toute migration, la restauration a été testée, les en-têtes de sécurité et limites de
taille ont été contrôlés sur un déploiement réel, et l'ensemble des contrôles qualité est rejoué
avant chaque livraison.

**Why this priority**: indispensable avant la production, mais ne bloque pas le développement ;
plusieurs points dépendent de décisions humaines (A21, A27).

**Independent Test**: dérouler la procédure sur un serveur de préproduction, y compris une
restauration complète et une migration volontairement défectueuse.

**Acceptance Scenarios**:

1. **Given** une nouvelle version contenant une migration, **When** l'exploitant la déploie,
   **Then** une sauvegarde datée de la base et des fichiers existe avant l'application de la
   migration, sinon le déploiement s'arrête avant de toucher la base.
2. **Given** une migration défectueuse, **When** elle échoue, **Then** la base reste dans son
   état antérieur ou est restaurable depuis la sauvegarde précédente, et la procédure de retour
   arrière est documentée et a été exercée.
3. **Given** une sauvegarde réelle, **When** l'exploitant la restaure sur un serveur vierge,
   **Then** l'application redémarre avec les demandes, vocaux, photos et journal d'audit
   intacts, et la durée de restauration est consignée.
4. **Given** un déploiement réel en HTTPS, **When** on contrôle les réponses, **Then** la
   politique de sécurité du contenu, HSTS et la limite de taille des envois sont présentes et
   conformes, et le résultat est consigné.
5. **Given** une livraison candidate, **When** les contrôles qualité sont rejoués (lint, tests
   unitaires, intégration, bout en bout, performance, audit des dépendances), **Then** tous
   passent et les résultats sont consignés, automatiquement ou manuellement selon FR-019.

---

### Edge Cases

- Un développeur a déjà un fichier de configuration local avec l'ancien port 3000 : le README
  DOIT indiquer comment l'aligner ; l'interface ne doit pas échouer silencieusement : avec l'API
  arrêtée, le proxy de développement répond 502 sans corps JSON et l'interface affiche « Une
  erreur inattendue est survenue. Réessayez plus tard. » ; sans aucune réponse, elle affiche
  « Connexion impossible. Vérifiez votre connexion internet puis réessayez. ». Ces messages
  existants sont conservés (FR-023) et vérifiés par un test automatisé.
- Le port 3002 est déjà occupé sur le poste : le lanceur s'arrête avec un message explicite
  (comportement actuel à conserver).
- Réinitialisation du mot de passe d'un super administrateur alors que la base est inaccessible :
  l'opération échoue entièrement, sans changement de mot de passe partiel ni audit orphelin.
- Plusieurs demandes en attente d'approbation au moment d'un changement de catégorie : la règle
  de FR-008 s'applique à chacune, indépendamment.
- Demande soumise **avant** le déploiement de la correction d'affectation : son snapshot contient
  le mode d'affectation mais pas la personne désignée ; exception EXC-1 de FR-008 (décision D9).
- Suppression du publicateur inutilisé ou du chargeur dupliqué alors qu'un test l'utilise
  indirectement : la suite complète doit rester verte, sinon la suppression est annulée.
- Sauvegarde impossible avant migration (disque plein) : le déploiement s'arrête et l'ancienne
  version continue de fonctionner.

## Requirements *(mandatory)*

### Functional Requirements

Chaque exigence indique les constats qu'elle traite. Le numéro FR-022 n'est pas utilisé ici, pour
éviter toute confusion avec FR-022 de la spécification du lot 1, toujours citée « FR-022 (lot 1) ».

**Configuration et environnement de développement**

- **FR-001** (A01): Toutes les sources de configuration et de documentation de l'environnement
  de développement (exemple de configuration, README, proxy HTTPS de développement, lanceur,
  tests) DOIVENT désigner le même port d'API, 3002.
- **FR-002** (A01): La configuration de production DOIT fixer explicitement le port interne de
  l'API ; elle NE DOIT PAS dépendre de la valeur par défaut de développement. Le port de
  production actuel (3000, interne au réseau des conteneurs) PEUT être conservé.
- **FR-003** (A02): Le lanceur de développement DOIT démarrer l'API en mode avec rechargement, ou
  bien le README et le lanceur DOIVENT indiquer et effectuer l'étape de compilation requise ; les
  deux documents NE DOIVENT PAS se contredire.
- **FR-004** (A07): Toutes les variables d'environnement lues par l'API, y compris la confiance
  envers le proxy et le port, DOIVENT être validées au démarrage par la même étape ; une valeur
  invalide DOIT empêcher le démarrage avec un message explicite.

**Sécurité et traçabilité**

- **FR-005** (A06): Les journaux applicatifs et le journal d'audit DOIVENT masquer le même
  ensemble de clés sensibles, défini en un seul endroit et couvrant au minimum l'union des deux
  listes actuelles (dont l'en-tête d'autorisation et le contenu des messages).
- **FR-006** (A08): Le contrôle d'origine DOIT être défini une seule fois et appliqué de façon
  identique aux requêtes HTTP modifiantes et aux connexions temps réel.
- **FR-007** (A05): Toute réinitialisation du mot de passe d'un super administrateur par un outil
  d'exploitation DOIT créer une entrée dans le journal d'audit non modifiable, fermer toutes ses
  sessions et imposer un changement de mot de passe à la connexion suivante, de la même manière
  que l'outil d'initialisation existant journalise ses actions.

**Affectation automatique et FR-022 (lot 1)**

- **FR-008** (A03, A04): Lors de l'approbation d'une demande en circuit B à affectation
  automatique, le mode d'affectation **et** la personne désignée DOIVENT être ceux figés dans le
  snapshot de la demande à sa soumission, conformément à FR-022 (lot 1) ; une modification
  ultérieure de la catégorie NE DOIT PAS changer l'affectation d'une demande déjà soumise
  (décision D1, 2026-10-15). Un employé proposé par le responsable alors que la personne figée
  est affectable est ignoré. Seules deux exceptions existent, toutes deux validées :
  - **EXC-1 — demande antérieure à la correction** (décision D9) : si le snapshot ne contient pas
    la clé de la personne désignée, celle-ci est lue dans la configuration actuelle de la
    catégorie ; le mode reste celui du snapshot ;
  - **EXC-2 — personne figée non affectable** (décision D8) : voir FR-011.
  La source de l'affectation (snapshot, catégorie actuelle, choix du responsable) DOIT être
  enregistrée dans l'historique de la demande.
- **FR-009** (A04): Avant toute correction, un test automatisé DOIT reproduire le comportement
  actuel (changement de catégorie entre soumission et approbation), afin de confirmer le constat
  [DÉDUIT] A04 ; la correction DOIT ensuite faire passer ce test selon FR-008.
- **FR-010** (A05): La réinitialisation du mot de passe du super administrateur DOIT être une
  sous-commande de l'outil d'initialisation existant, conforme à FR-007 ; le script séparé DOIT
  être supprimé et la documentation d'exploitation mise à jour (décision D2, 2026-10-15).
- **FR-011** (A03): Si la personne à affecter selon FR-008 (figée, ou lue selon EXC-1) est
  inactive ou n'est plus destinataire de la catégorie à l'approbation, une approbation sans
  employé choisi DOIT être refusée avec un message invitant le responsable à choisir l'employé,
  sans aucune écriture. Le responsable PEUT alors approuver en choisissant un employé
  affectable (actif et destinataire de la catégorie) ; aucun compte non affectable NE DOIT être
  affecté (décision D8).

**Dépendances entre modules et dette technique**

- **FR-012** (A09, A12): Il NE DOIT exister aucun cycle de dépendance entre les domaines demandes,
  fichiers, authentification, audit et socle commun ; les règles transverses (permissions par
  rôle, droits d'administration et d'audit) DOIVENT être placées hors du domaine des demandes.
- **FR-013** (A09): Une vérification automatique des cycles de dépendance DOIT faire partie des
  contrôles qualité du projet et échouer en nommant les fichiers en cause.
- **FR-014** (A10, A11): Le stockage de fichiers NE DOIT contenir aucune règle d'accès propre à un
  domaine métier ; chaque domaine DOIT fournir sa propre décision d'accès à ses fichiers. Les
  décisions d'accès observables (autorisations, refus, journalisation des refus) DOIVENT rester
  identiques, prouvé par les tests existants inchangés dans leurs attendus.
- **FR-015** (A13, A15, A16, A18, A19): Le chargeur de règles de catégorie DOIT être déclaré une
  seule fois et partagé ; le job de délais de la couverture de classe DOIT être rangé avec les
  autres tâches planifiées ; le publicateur inutilisé, son commentaire périmé et la dépendance
  d'icônes inutilisée DOIVENT être supprimés ; les scripts d'exploitation DOIVENT respecter la
  convention de formatage du projet.
- **FR-016** (A17): Toute divergence entre les statuts, priorités et autres énumérations du
  contrat du serveur et celles de l'interface DOIT être détectée automatiquement par les
  contrôles qualité ; l'annonce de types générés qui n'existent pas DOIT être retirée ou rendue
  vraie.

**Tests et préparation à la production**

- **FR-017** (A01, A20, A26): Avant clôture de cette fonctionnalité, le lint, les tests
  unitaires, d'intégration, de bout en bout et de performance DOIVENT être exécutés et passer ;
  les résultats DOIVENT être consignés dans `docs/validation/`, comme pour la vérification finale
  du lot 1.
- **FR-018** (A22, A23): Le déploiement DOIT garantir l'existence d'une sauvegarde de la base et
  des fichiers, datée et postérieure à la dernière modification de données, avant toute
  application de migration ; à défaut, il DOIT s'arrêter avant de toucher la base.
- **FR-019** (A21): Les contrôles qualité DOIVENT être rejoués avant chaque livraison
  (décision D3, 2026-10-15) :
  - automatiquement, à chaque envoi sur le dépôt distant et à chaque demande de fusion : lint,
    tests unitaires, d'interface et d'intégration, audit des dépendances ; un échec DOIT être
    visible sur la demande de fusion ;
  - manuellement avant chaque livraison : tests de bout en bout et de performance, avec un
    compte rendu daté dans `docs/validation/`.
- **FR-020** (A24): La procédure de restauration DOIT être exercée au moins une fois sur un
  serveur vierge à partir d'une sauvegarde réelle, et le résultat (succès, durée, écarts)
  consigné.
- **FR-021** (A25): Les en-têtes de sécurité (politique de sécurité du contenu, HSTS) et la limite
  de taille des envois DOIVENT être contrôlés sur un déploiement HTTPS réel ou de préproduction,
  et le résultat consigné.
- **FR-023**: Aucune correction NE DOIT modifier le comportement fonctionnel visible des
  utilisateurs, à l'exception de la règle d'affectation de FR-008 (avec ses exceptions EXC-1 et
  EXC-2), du refus et du choix par le responsable décrits en FR-011, et de la mention de la source
  d'affectation dans l'historique.
- **FR-024** (A01–A35): `docs/ARCHITECTURE.md` DOIT être mis à jour à la fin de la
  fonctionnalité : chaque constat traité est marqué comme corrigé avec sa référence, chaque
  constat [DÉDUIT] confirmé ou infirmé est re-marqué [VÉRIFIÉ] ou retiré.

### Décisions nécessitant une validation humaine

Ces points NE SONT PAS des exigences définitives tant qu'ils ne sont pas tranchés. D1 à D3 ont été
tranchés (voir Clarifications), ainsi que D8 et D9 ; D4 à D7 restent ouverts et hors périmètre.

| ID | Décision | Constats | Qui | Effet sur cette fonctionnalité |
|----|----------|----------|-----|--------------------------------|
| D1 | Règle d'affectation automatique à l'approbation | A03, A04 | Responsable du projet | **Tranchée le 2026-10-15** : tout figé à la soumission (FR-008). À faire confirmer par l'établissement, sans bloquer l'implémentation |
| D2 | Sort de l'outil de réinitialisation du super administrateur | A05 | Responsable du projet | **Tranchée le 2026-10-15** : sous-commande de l'outil d'initialisation (FR-010) |
| D3 | Intégration continue automatique ou procédure manuelle | A21 | Responsable du projet | **Tranchée le 2026-10-15** : CI pour lint et tests rapides, manuel pour bout en bout et performance (FR-019) |
| D4 | Durées de conservation des données personnelles et purge automatique | A27 | Établissement (RGPD) | Hors périmètre ; aucune purge ne sera implémentée sans décision |
| D5 | Spécification du lot 2 (couverture de classe : statuts, délais de 2 et 5 min, preuves) | A32 | Établissement | Hors périmètre ; FR-014 ne change aucune règle du lot 2 |
| D6 | Autres valeurs provisoires du README « À trancher » (permissions par rôle, délais, destinataires, accusé de lecture) | §11.10 | Établissement | Hors périmètre ; aucune valeur modifiée |
| D7 | Origine des choix techniques (pile imposée ou proposée) | §6, §11.1 | Responsable du projet | Aucun ; information documentaire |
| D8 | Suite d'un refus quand la personne figée n'est plus affectable | A03 | Responsable du projet | **Tranchée le 2026-10-15** : le responsable choisit un employé affectable (FR-011, exception EXC-2) |
| D9 | Règle pour les demandes antérieures sans personne figée | A03, A04 | Responsable du projet | **Tranchée le 2026-10-15** : catégorie actuelle, tracée dans l'historique (FR-008, exception EXC-1) |

### Hors périmètre

- Fusion des deux machines à états, politiques d'accès et calculs de délais (A29) : changement
  structurel majeur, à justifier dans une fonctionnalité dédiée (principe II).
- Découpage des services volumineux (A30) et réduction des modules globaux (A31), sauf ce
  qu'exige FR-012.
- Fonctionnement multi-instances de l'API (A28), suivi d'erreurs et métriques (A33), remplacement
  de la base embarquée de développement (A34).
- Validations manuelles du lot 1 (A35 : tâches T119 et T120).

### Key Entities *(include if feature involves data)*

- **Constat d'audit** : élément du registre (ID, résumé, section source, marquage [VÉRIFIÉ] /
  [DÉDUIT], classe CT / DH / HP, statut de traitement).
- **Règle d'affectation figée (snapshot)** : copie des règles d'une catégorie conservée avec la
  demande à sa soumission ; elle inclut le mode d'affectation **et** la personne désignée
  (décision D1). Un snapshot antérieur à la correction, sans la personne désignée, relève de
  l'exception EXC-1 (décision D9).
- **Entrée d'audit d'exploitation** : trace non modifiable d'une action faite hors interface
  (outil d'exploitation), avec action, cible, date et origine.
- **Rapport de vérification** : résultat consigné d'une exécution des contrôles qualité, d'une
  restauration ou d'un contrôle des en-têtes de sécurité (date, environnement, résultats).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un développeur qui suit uniquement le README démarre l'application et se connecte
  en moins de 10 minutes (hors téléchargements), sans modifier aucun fichier du dépôt.
- **SC-002**: 100 % des tests passent dans chacune des suites : unitaires, intégration, bout en
  bout, interface, performance ; le lint ne signale aucun problème ; aucune vulnérabilité de
  sévérité élevée ou critique.
- **SC-003**: Aucune mention d'un autre port que 3002 ne subsiste dans la configuration et la
  documentation de développement.
- **SC-004**: 100 % des réinitialisations de mot de passe du super administrateur produisent une
  entrée d'audit et ferment toutes ses sessions (vérifié par test).
- **SC-005**: Pour chacun des cas de test d'affectation (changement de personne, changement de
  mode, personne désactivée ou retirée des destinataires, demande antérieure), la personne
  affectée et la source enregistrée sont celles prévues par FR-008 et FR-011 (décisions D1, D8,
  D9) dans 100 % des cas.
- **SC-006**: Zéro cycle de dépendance entre les domaines cités, et l'introduction volontaire
  d'un cycle fait échouer les contrôles qualité.
- **SC-007**: Les tests existants d'accès aux fichiers et aux demandes passent sans modification
  de leurs attendus.
- **SC-008**: Une restauration complète sur serveur vierge a réussi au moins une fois, avec une
  durée consignée ; les contrôles d'en-têtes de sécurité sont consignés comme conformes.
- **SC-009**: 100 % des constats CT du registre sont marqués corrigés dans
  `docs/ARCHITECTURE.md`, et chaque constat [DÉDUIT] traité est confirmé ou infirmé.

## Assumptions

- Le port de développement 3002 est acquis : il a été commité le 2026-10-15 (`1e6d4ee`). Le port
  interne de production reste 3000, fixé explicitement par le déploiement.
- Le rapport `docs/ARCHITECTURE.md` est exact à la date de son commit ; aucun constat n'est
  ré-audité, seuls les constats [DÉDUIT] sont confirmés au moment de leur traitement.
- La fonctionnalité est développée sur une branche issue de `002-refonte-ui-destinataires`, car
  elle corrige du code de ce lot (couverture de classe). Le numéro 003 a été choisi pour laisser
  le numéro 002 à une éventuelle spécification du lot 2 (D5).
- L'application tourne sur une seule instance (A28) ; les corrections n'ont pas à rendre l'API
  multi-instances.
- Aucune reprise des snapshots existants n'est prévue : les demandes antérieures relèvent de
  l'exception EXC-1 (décision D9).
- Les décisions D1, D8 et D9 ont été prises par le responsable du projet ; elles restent à faire
  confirmer par l'établissement, sans bloquer l'implémentation.
- Les outils d'exploitation sont utilisés par une personne ayant accès au serveur ; ils restent
  hors de l'interface web.
- Le serveur de préproduction ou de production nécessaire à FR-020 et FR-021 sera fourni par
  l'exploitant ; à défaut, ces exigences restent ouvertes et la fonctionnalité ne peut être
  déclarée prête pour la production.
- Aucune nouvelle donnée personnelle n'est collectée : l'entrée d'audit d'exploitation ne
  contient que l'identifiant du compte ciblé et l'origine de l'action.

## Données personnelles

Cette fonctionnalité ne collecte aucune nouvelle donnée personnelle. Elle renforce le masquage des
secrets et du contenu des messages dans les journaux (FR-005). Les durées de conservation
restent celles, provisoires, du lot 1 (D4).
