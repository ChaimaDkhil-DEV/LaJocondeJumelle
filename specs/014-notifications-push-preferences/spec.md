# Spécification de fonctionnalité : Notifications push et préférences utilisateur (Push notifications and user preferences)

**Branche de fonctionnalité** : `014-notifications-push-preferences` (non créée : rédaction sur `master`, à la
demande de l'utilisatrice)

**Créée le** : 2026-11-09

**Statut** : Brouillon — clarifiée le 2026-11-09 (NC-1 à NC-10 validées), prête pour la planification

**Entrée** : description de l'utilisatrice : « Spec 014 — Notifications Push et préférences utilisateur. Web Push
pour quatre catégories (urgent, couverture, garde non pourvue, pointage), parc mixte iPhone/Android, préférences
individuelles par catégorie, plage horaire commune réglée par l'administration, contenu minimal sur l'écran
verrouillé, abonnements liés à l'utilisateur et à l'appareil, fonction désactivée par défaut. Uniquement le push
et les préférences : pas de regroupement, d'escalade, d'e-mail ni de modèle générique de notification. »
Décisions D1 à D10 ci-dessous.

## Contexte

Aujourd'hui, une notification n'atteint son destinataire que si l'application est ouverte. Constaté dans le code :

- chaque notification est une ligne (`Notification` : destinataire, type, demande liée, priorité copiée de la
  demande, date de lecture) écrite **dans la transaction** de l'action qui la provoque ; l'auteur de l'action n'est
  jamais notifié, et le super administrateur ne reçoit sur les demandes de travail que ses alertes de supervision
  (règle `super-admin-policy`) ;
- **après validation** de la transaction, un diffuseur (`NotificationPublisher`, implémenté par la publication
  Socket.IO) pousse la notification aux onglets ouverts du destinataire ; si le serveur redémarre entre les deux,
  la diffusion est perdue mais la notification reste en base et réapparaît au rechargement ;
- l'interface affiche une cloche avec compteur, une alerte temporaire et, pour les urgences, un signal sonore
  facultatif dont le réglage est conservé **dans le navigateur** (stockage local), pas sur le compte ;
- l'application n'a ni manifeste d'application installable ni composant d'arrière-plan (service worker) ;
- les réglages globaux de l'établissement sont modifiables par le **super administrateur** seul, et chaque
  modification est journalisée (`SETTING_CHANGED`, valeurs avant/après) ;
- les sessions expirent après 60 minutes d'inactivité ou 12 heures (réglages globaux) ; la déconnexion ferme la
  session courante ; la désactivation d'un compte et la réinitialisation du mot de passe par un administrateur
  ferment toutes ses sessions ; le changement de son propre mot de passe ferme ses **autres** sessions.

Conséquence : un surveillant en ronde, téléphone verrouillé, ne voit ni l'affectation qu'on vient de lui confier
ni la garde restée non pourvue, alors que ce sont les messages où chaque minute compte.

### Constat architectural vérifié

- Les quatre catégories retenues correspondent à des types de notification **existants**, tous liés à une
  demande ou à une affectation (le lien vers la demande est obligatoire sur chaque notification).
- Le modèle `Notification` **n'est pas modifié** par cette spécification ; aucun modèle générique n'est créé ;
  les notifications sans demande restent hors périmètre.
- Les seules nouvelles données métier sont : les **abonnements push des appareils** et les **préférences push**
  des utilisateurs. La plage horaire est un réglage global de plus, dans le mécanisme de réglages existant.

### Écarts constatés entre les décisions et le code

1. **Types jamais émis.** `COVERAGE_NEW` (« Garde à prendre »), `COVERAGE_TAKEN`, `COVERAGE_ACCEPTED` et
   `COVERAGE_RELEASED` existent dans l'énumération mais **aucun code ne les crée** (vestiges du lot 2, remplacés
   par les affectations de la spec 004). L'exemple « Garde à prendre — CE1 Vert » de D7 ne peut donc pas se
   produire ; il est remplacé ici par « Classe vide signalée — CE1 Vert ».
2. **Types génériques sur les gardes.** Les gardes (demandes de nature `COVERAGE`) utilisent aussi des types
   génériques : `ASSIGNED`, `CLOSED`, `CANCELLED`, `STATUS_CHANGED`. La catégorie d'une notification dépend donc du
   **type et de la nature de la demande** (travail ou garde), jamais de la seule priorité.
3. **Priorité des gardes.** Plusieurs notifications de garde sont créées avec la priorité `URGENT` quelle que soit
   la demande (relève, double affectation, affectation d'une relève), et les gardes ont souvent une priorité
   urgente. La règle « priorité urgente » ne s'applique donc **qu'aux demandes de travail** (D1).
4. **Rôle qui règle la plage horaire.** D6 dit « l'administrateur » ; or les réglages globaux sont aujourd'hui
   réservés au super administrateur, et « Administrateur » (`ADMIN`) est un rôle distinct. Résolu : le super
   administrateur seul règle la plage (clarification NC-10).
5. **Fuseau horaire.** D6 fixe `Africa/Tunis` ; l'application calcule déjà les heures de l'école dans un fuseau
   configurable (`SCHOOL_TIMEZONE`, défaut `Europe/Paris`, utilisé par les rappels des affectations). La plage
   horaire utilise ce même fuseau, qui doit valoir `Africa/Tunis` dans la configuration de l'établissement (voir
   Hypothèses) ; aucun second fuseau n'est introduit.

### Décisions validées (comptent comme clarifications)

- **D1 — Catégories push** : Urgent, Couverture, Garde non pourvue, Pointage. La priorité urgente ne vaut que pour
  les demandes de travail. Correspondance détaillée ci-dessous.
- **D2 — Appareils** : parc mixte. Android : push dans les navigateurs compatibles sans installation obligatoire.
  iPhone/iPad : iOS/iPadOS 16.4 ou ultérieur **et** application ajoutée à l'écran d'accueil. Ordinateurs et
  tablettes : selon le navigateur. L'installation reste facultative là où elle n'est pas exigée ; l'application
  reste entièrement utilisable sans push.
- **D3 — Périmètre** : push et préférences uniquement.
- **D4 — Enseignant arrivé** : `COVERAGE_TEACHER_ARRIVED` part en push **au surveillant affecté seulement** ; les
  administrateurs le gardent dans l'application ; les destinataires dans l'application ne changent pas.
- **D5 — Préférences individuelles** : chaque catégorie s'active ou se désactive séparément, sur le compte,
  synchronisée entre les appareils, sous réserve de l'autorisation du navigateur et du système. Le réglage du son
  des urgences devient une préférence du compte (clarification NC-6).
- **D6 — Plage horaire commune** : une seule plage pour tout l'établissement (exemple : lundi–vendredi,
  07:30–18:30), heure de Tunis. Hors plage, la notification reste dans l'application, sans push différé. Pas de
  plage individuelle. Chaque modification est journalisée.
- **D7 — Contenu** : libellé du type, plus le nom de la classe ou la référence si nécessaire. Jamais de titre ou
  description de demande, de contenu de message, de nom d'enseignant ou d'élève, ni d'autre donnée personnelle ou
  sensible. Tests automatiques sur les contenus.
- **D8 — Cycle de vie** : abonnement lié à l'utilisateur et à l'appareil ; il survit à l'expiration de la session
  pour inactivité ; il est supprimé à la déconnexion explicite, à la réinitialisation du mot de passe, à la
  désactivation du compte, sur réponse 404 ou 410 du service de push, et après 90 jours sans utilisation (dernière
  ouverture authentifiée de l'application sur l'appareil, distincte du dernier envoi réussi : clarification NC-3).
  Un clic après expiration mène à la connexion.
- **D9 — Services tiers et activation** : le push transite par les services des éditeurs de navigateurs et de
  plateformes ; le contenu est chiffré selon le protocole Web Push, mais ces services traitent les métadonnées
  nécessaires à l'acheminement. Fonction désactivée par défaut : sans clés d'identification du serveur (VAPID),
  pas de push ; activation sur décision de l'établissement ; mention au registre RGPD ; clé privée uniquement côté
  serveur.
- **D10 — Application au premier plan** : pas de notification système sur l'appareil où l'application est ouverte
  et au premier plan ; les autres appareils de l'utilisateur la reçoivent ; doublons évités autant que les
  navigateurs le permettent.

### Correspondance entre types et catégories (vérifiée dans le code, validée le 2026-11-09)

Légende : **Push** = envoyé en push si la catégorie est active chez le destinataire ; **Appli** = reste dans
l'application seulement. Tout type absent de la colonne Push reste dans l'application.

| Type (libellé affiché) | Nature | Émis par / destinataires actuels | Catégorie |
|---|---|---|---|
| `URGENT` (Demande urgente) | Travail | Soumission, approbation ou réaffectation d'une demande urgente → employé affecté ou responsables de la catégorie ; alerte de supervision → super administrateurs | **Urgent — Push** |
| Autres types d'une demande de travail, urgente ou non (`REQUEST_NEW`, `ASSIGNED`, `MESSAGE_NEW`, `STATUS_CHANGED`, `OVERDUE`, `UNASSIGNED`, `CLOSED`…) | Travail | Règles actuelles | Appli (NC-1) |
| `COVERAGE_REQUESTED` (Retard ou absence signalé) | Garde | Administrateurs | **Couverture — Push** |
| `COVERAGE_EMPTY_CLASS` (Classe vide signalée) | Garde | Administrateurs | **Couverture — Push** |
| `ASSIGNED` sur une garde (Demande affectée) | Garde | Surveillant affecté et enseignant auteur | **Couverture — Push** |
| `COVERAGE_LIFTED` (Affectation levée) | Garde | Ancien surveillant affecté, renforts | **Couverture — Push** |
| `COVERAGE_UPDATED` (Affectation modifiée) | Garde | Surveillant affecté et administrateurs | **Couverture — Push** |
| `COVERAGE_EXTENDED` (Garde prolongée) | Garde | Surveillant affecté et administrateurs | **Couverture — Push** |
| `COVERAGE_RELIEF_REQUESTED` (Relève demandée) | Garde | Administrateurs et super administrateurs | **Couverture — Push** |
| `COVERAGE_LATE` (Garde en retard) | Garde | Administrateurs, super administrateurs, surveillant affecté | **Couverture — Push** |
| `COVERAGE_DOUBLE_ASSIGNMENT` (Surveillant sur deux affectations) | Garde | Administrateurs | **Couverture — Push** |
| `COVERAGE_SUPPORT_REMINDER` (Renfort à décider) | Garde | Administrateurs (rappel planifié) | **Couverture — Push** |
| `COVERAGE_TAKEOVER_EXPIRED` (Demande en attente d'assignation) | Garde | Administrateurs (rappel planifié) | **Garde non pourvue — Push** |
| `COVERAGE_ESCALATED` (Alerte non traitée) | Garde | Super administrateurs (escalade planifiée) | **Garde non pourvue — Push** |
| `COVERAGE_UNFILLED` (Garde non pourvue) | Garde | Administrateurs et enseignant auteur | **Garde non pourvue — Push** |
| `COVERAGE_TEACHER_ARRIVED` (Enseignant arrivé) | Garde | Administrateurs et surveillant affecté | **Pointage — Push au surveillant affecté seulement (D4)** |
| `COVERAGE_ATTENDANCE_ANOMALY` (Absence annoncée mais enseignant présent) | Garde | Administrateurs | **Pointage — Push** |
| `COVERAGE_RELIEVED` (Garde terminée) | Garde | Surveillant affecté, administrateurs (et super administrateurs si fin par un responsable) | Appli |
| `COVERAGE_PRESENCE`, `COVERAGE_DUPLICATE`, `COVERAGE_MORNING_REMINDER`, `COVERAGE_CLOSE_REMINDER` | Garde | Règles actuelles | Appli |
| `CLOSED`, `CANCELLED`, `STATUS_CHANGED` sur une garde | Garde | Règles actuelles | Appli |
| `COVERAGE_NEW`, `COVERAGE_TAKEN`, `COVERAGE_ACCEPTED`, `COVERAGE_RELEASED` | Garde | **Jamais émis** | Sans objet |

## Scénarios utilisateur et tests *(obligatoire)*

### User Story 1 - Recevoir une affectation téléphone verrouillé (Priorité : P1)

Pendant sa ronde, une surveillante a le téléphone Android en poche, écran verrouillé, application fermée. Un
administrateur lui affecte la garde de CE1 Vert. Son téléphone affiche « Demande affectée — CE1 Vert ». Elle touche
la notification : l'application s'ouvre sur la garde ; la notification est marquée lue dans la cloche.

**Pourquoi cette priorité** : c'est la raison d'être de la fonctionnalité ; sans elle, rien ne change sur le
terrain.

**Test indépendant** : avec un service de push simulé, affecter une garde à un utilisateur abonné et vérifier
qu'un push est demandé pour chacun de ses appareils, avec le contenu prévu par D7 ; en préproduction, mesurer
l'affichage sur un appareil réel (SC-001).

**Scénarios d'acceptation** :

1. **Étant donné** une surveillante abonnée, catégorie Couverture active, dans la plage horaire, **quand** une
   garde lui est affectée, **alors** chacun de ses appareils abonnés reçoit un push « Demande affectée — <classe> »
   et la notification apparaît aussi dans la cloche, comme aujourd'hui.
2. **Étant donné** ce push affiché, **quand** elle le touche avec une session valide, **alors** l'application ouvre
   la garde et la notification est marquée lue après l'ouverture réussie de la garde.
3. **Étant donné** sa session expirée pour inactivité, **quand** elle touche le push, **alors** elle arrive sur la
   page de connexion ; la notification n'est marquée lue qu'une fois la garde ouverte après connexion.
4. **Étant donné** l'application ouverte et au premier plan sur ce téléphone, **quand** l'affectation arrive,
   **alors** seule l'alerte dans l'application s'affiche sur ce téléphone, et son ordinateur abonné reçoit le push.
5. **Étant donné** un enseignant dont l'arrivée est enregistrée sur une garde, **quand** la notification « Enseignant
   arrivé » est créée, **alors** seul le surveillant affecté reçoit un push ; les administrateurs la voient dans
   l'application, sans push.

---

### User Story 2 - Activer le push sur son appareil, y compris sur iPhone (Priorité : P1)

Un administrateur ouvre « Mon profil » sur son iPhone, dans Safari. La section « Notifications push » lui explique
qu'il faut d'abord ajouter l'application à l'écran d'accueil (« Partager », puis « Sur l'écran d'accueil »). Il le
fait, ouvre l'application depuis l'écran d'accueil, appuie sur « Activer les notifications sur cet appareil » et
accepte la demande d'autorisation. L'état passe à « Actif » et l'appareil apparaît dans la liste.

**Pourquoi cette priorité** : le parc est mixte (D2) et une partie du personnel utilise un iPhone ; sans parcours
guidé, le push y paraît en panne.

**Test indépendant** : simuler chaque état (pris en charge, non installé sur iPhone, refusé, non pris en charge,
désactivé par l'établissement) et vérifier le message, l'action proposée et l'absence de demande d'autorisation
avant le clic.

**Scénarios d'acceptation** :

1. **Étant donné** l'ouverture de « Mon profil », **quand** la page s'affiche, **alors** aucune demande
   d'autorisation n'est déclenchée ; elle ne l'est qu'après un clic sur « Activer les notifications sur cet
   appareil ».
2. **Étant donné** un iPhone ou iPad où l'application n'est pas ajoutée à l'écran d'accueil, **quand** la section
   s'affiche, **alors** elle donne les étapes « Partager » puis « Sur l'écran d'accueil », en texte, sans bouton
   d'activation inopérant.
3. **Étant donné** un système iOS/iPadOS antérieur à 16.4 ou un navigateur sans push, **quand** la section
   s'affiche, **alors** l'état est « Non pris en charge sur cet appareil », et la cloche continue de fonctionner.
4. **Étant donné** une autorisation refusée dans le navigateur, **quand** la section s'affiche, **alors** l'état est
   « Refusé » avec l'indication de la réactiver dans les réglages du navigateur ou du système.
5. **Étant donné** l'établissement n'ayant pas activé le push, **quand** la section s'affiche, **alors** l'état est
   « Désactivé par l'établissement » et aucune activation n'est possible.
6. **Étant donné** un Android avec un navigateur compatible, **quand** l'utilisateur active le push, **alors**
   aucune installation n'est exigée.

---

### User Story 3 - Choisir ses catégories (Priorité : P1)

Un enseignant ne veut pas être dérangé par la catégorie Couverture mais garde Pointage et Urgent. Dans « Mon
profil », il désactive Couverture. Le réglage vaut aussitôt pour tous ses appareils ; les notifications de
couverture continuent d'arriver dans la cloche.

**Pourquoi cette priorité** : le push sans moyen de le régler devient vite insupportable, et le personnel utilise
souvent son téléphone personnel.

**Test indépendant** : désactiver une catégorie sur un appareil, créer une notification de cette catégorie et
vérifier qu'aucun push n'est demandé pour aucun appareil, et que la notification est bien dans la cloche.

**Scénarios d'acceptation** :

1. **Étant donné** la section « Notifications push », **quand** l'utilisateur désactive une catégorie, **alors**
   c'est fait en trois actions au plus depuis l'ouverture de « Mon profil » et le réglage est enregistré sur son
   compte.
2. **Étant donné** une catégorie désactivée, **quand** une notification de cette catégorie est créée, **alors**
   aucun push n'est envoyé à aucun de ses appareils, et la notification apparaît dans l'application.
3. **Étant donné** le réglage modifié sur l'ordinateur, **quand** l'utilisateur ouvre « Mon profil » sur son
   téléphone, **alors** il y voit le même réglage.
4. **Étant donné** toutes les catégories désactivées, **quand** une notification arrive, **alors** aucun push n'est
   envoyé ; les appareils restent abonnés et la reprise ne demande pas de nouvelle autorisation.

---

### User Story 4 - Régler la plage horaire de l'établissement (Priorité : P2)

Le super administrateur fixe la plage d'envoi dans les réglages de l'établissement : lundi à vendredi,
07:30–18:30. Une garde non pourvue signalée à 19:10 reste dans l'application, sans push, ni ce soir ni le
lendemain.

**Pourquoi cette priorité** : protège le temps personnel du personnel ; utile dès que le push est actif, mais une
valeur par défaut suffit au démarrage.

**Test indépendant** : modifier la plage, créer des notifications avant, pendant et après, et vérifier les envois
et l'entrée d'audit.

**Scénarios d'acceptation** :

1. **Étant donné** l'écran des réglages de l'établissement, **quand** le super administrateur modifie les jours ou
   les heures, **alors** la nouvelle plage s'applique aux envois suivants et l'audit enregistre l'auteur, la date
   et les valeurs avant et après.
2. **Étant donné** une notification créée hors plage, **quand** la plage s'ouvre ensuite, **alors** aucun push n'est
   envoyé pour elle (pas de push différé).
3. **Étant donné** une plage invalide (heure de fin avant l'heure de début, aucun jour), **quand** elle est
   enregistrée, **alors** elle est refusée avec un message qui dit quoi corriger.
4. **Étant donné** un utilisateur autre que le super administrateur (administrateur compris), **quand** il tente de
   modifier la plage, **alors** le serveur refuse et journalise le refus.
5. **Étant donné** une notification urgente de couverture créée à 07:10 avec une plage ouvrant à 07:30, **quand**
   elle est créée, **alors** aucun push n'est envoyé (aucune exception à la plage) ; l'heure d'ouverture se choisit
   en conséquence.

---

### User Story 5 - Gérer ses appareils et ne plus rien recevoir après déconnexion (Priorité : P2)

Une surveillante voit dans « Mon profil » la liste de ses appareils abonnés (« iPhone · Safari », « Windows ·
Edge »). Elle retire une ancienne tablette. Plus tard, elle se déconnecte de la tablette partagée de la salle des
surveillants : cette tablette ne reçoit plus ses notifications.

**Pourquoi cette priorité** : condition de confiance et de confidentialité, surtout sur les appareils partagés.

**Test indépendant** : abonner deux appareils, en retirer un, se déconnecter de l'autre ; vérifier qu'aucun push ne
leur est plus envoyé et que les données correspondantes sont supprimées.

**Scénarios d'acceptation** :

1. **Étant donné** plusieurs appareils abonnés, **quand** elle ouvre la section, **alors** elle voit chacun avec son
   libellé et sa date d'activation, l'appareil actuel étant signalé, et peut retirer n'importe lequel.
2. **Étant donné** une déconnexion explicite sur un appareil, **quand** une notification lui est ensuite destinée,
   **alors** cet appareil ne reçoit rien ; ses autres appareils abonnés la reçoivent.
3. **Étant donné** son compte désactivé ou son mot de passe réinitialisé par un administrateur, **quand** une
   notification aurait pu lui être destinée, **alors** aucun de ses anciens appareils ne reçoit de push.
4. **Étant donné** sa session expirée pour inactivité, sans déconnexion, **quand** une notification lui est
   destinée, **alors** l'appareil la reçoit encore (D8) ; c'est pourquoi la section recommande de se déconnecter
   explicitement en quittant un appareil partagé.
5. **Étant donné** un collègue qui active ensuite le push sur le même navigateur avec son propre compte, **quand**
   l'activation réussit, **alors** l'abonnement de cet appareil passe au collègue et elle n'y reçoit plus rien.
6. **Étant donné** qu'elle change son propre mot de passe depuis son téléphone, **quand** le changement est
   enregistré, **alors** les abonnements de ses autres appareils sont supprimés, comme leurs sessions ; celui du
   téléphone est conservé.

---

### User Story 6 - Sans push, l'application fonctionne comme aujourd'hui (Priorité : P2)

Push désactivé par l'établissement, appareil non compatible, service de push en panne : les actions aboutissent,
la cloche, l'alerte temporaire et le son des urgences fonctionnent comme aujourd'hui.

**Pourquoi cette priorité** : le push est un canal en plus, jamais une condition du fonctionnement.

**Test indépendant** : faire échouer le service de push simulé (erreurs, délais) et désactiver les clés ; vérifier
que les actions métier réussissent et que les notifications dans l'application sont identiques.

**Scénarios d'acceptation** :

1. **Étant donné** des clés absentes, **quand** une notification est créée, **alors** aucun envoi n'est tenté et
   l'interface indique « Désactivé par l'établissement ».
2. **Étant donné** un service de push qui répond en erreur ou ne répond pas, **quand** une action crée des
   notifications, **alors** l'action réussit dans les mêmes délais qu'aujourd'hui et les notifications sont dans
   l'application.

### Cas limites

- **Plusieurs appareils** : un push par appareil abonné du destinataire ; l'appareil au premier plan n'affiche pas
  de notification système (D10). Sur les plateformes qui imposent l'affichage de chaque push (notamment Safari sur
  iPhone/iPad), une notification système peut apparaître même au premier plan ; à confirmer pendant le plan.
- **Plusieurs onglets** sur le même appareil : au plus une notification système par notification et par appareil.
- **Nouvelle tentative** : elle ne doit jamais produire deux notifications visibles pour la même notification sur
  le même appareil ; la notification remplace la précédente si elle est déjà affichée.
- **Événements simultanés** : deux notifications distinctes donnent deux push (le regroupement est hors périmètre).
- **Service de push** : 404 ou 410 → abonnement supprimé ; erreur temporaire (réseau, délai, 429, 5xx) → 3
  tentatives au plus, à délais croissants, dans la durée de validité ; autre erreur définitive → pas de nouvelle
  tentative, erreur journalisée sans contenu.
- **Redémarrage du serveur** pendant des tentatives en attente : elles sont perdues, comme la diffusion Socket.IO
  aujourd'hui ; la notification reste dans l'application.
- **Appareil hors réseau** : le service de push conserve le message jusqu'à la fin de la durée de validité
  (30 minutes), puis l'abandonne ; la notification reste dans l'application.
- **Autorisation retirée** dans les réglages du système : l'abonnement devient invalide, est supprimé à la première
  réponse 404/410, et la section affiche « Refusé ».
- **Même navigateur, deux comptes successifs** : un abonnement d'appareil n'appartient qu'à un seul utilisateur à
  la fois ; il passe au dernier utilisateur qui active le push sur ce navigateur, et le précédent n'y reçoit plus
  rien.
- **Changement de son propre mot de passe** : comme pour les sessions, les abonnements des autres appareils de
  l'utilisateur sont supprimés ; celui de l'appareil courant est conservé.
- **Préférences modifiées en même temps sur deux appareils** : la dernière valeur enregistrée l'emporte, catégorie
  par catégorie ; l'autre appareil affiche la valeur à jour à son prochain affichage de la section.
- **Son des urgences** : à la première ouverture après la mise en service, une valeur « désactivé » trouvée dans le
  navigateur est reprise une fois dans le compte ; ensuite, seul le réglage du compte compte.
- **Destinataire désactivé** entre la création de la notification et l'envoi : rien n'est envoyé.
- **Ressource devenue inaccessible** (garde anonymisée, droits retirés) au moment du clic : message d'erreur
  habituel, sans révéler la ressource ; la notification n'est pas marquée lue par ce clic.
- **Enseignant arrivé sans surveillant affecté** : aucun push (D4), notification inchangée pour les administrateurs.
- **Super administrateur** : il ne reçoit en push que des notifications qu'il reçoit déjà dans l'application ; la
  règle `super-admin-policy` est inchangée.
- **Bord de plage** : la plage est évaluée au premier envoi ; une notification créée à 18:29 et envoyée à 18:29
  part, ses nouvelles tentatives restent possibles dans la durée de validité.
- **Clés renouvelées** par l'établissement : les abonnements existants deviennent invalides ; chaque appareil
  affiche « À réactiver ».

## Exigences *(obligatoire)*

### Exigences fonctionnelles

#### Abonnement et compatibilité

- **FR-001** : L'utilisateur DOIT pouvoir activer le push pour l'appareil courant depuis « Mon profil ». La demande
  d'autorisation du navigateur NE DOIT être déclenchée qu'après une action explicite de sa part (jamais à
  l'ouverture d'une page ou à la connexion).
- **FR-002** : Sur iPhone/iPad, quand l'application n'est pas ajoutée à l'écran d'accueil, la section DOIT afficher
  des instructions claires et textuelles : « Partager », puis « Sur l'écran d'accueil », avec la version minimale
  (iOS/iPadOS 16.4). L'application DOIT être installable (nom, icône, ouverture sur l'accueil de l'application) ;
  l'installation NE DOIT PAS être exigée là où le navigateur n'en a pas besoin.
- **FR-003** : La section DOIT afficher l'état du push sur l'appareil courant — actif, refusé, non pris en charge,
  désactivé par l'établissement, à réactiver — et la liste des appareils abonnés de l'utilisateur (libellé, date
  d'activation, appareil courant signalé), chacun pouvant être retiré. Elle DOIT recommander de se déconnecter
  explicitement en quittant un appareil partagé, l'abonnement survivant à l'expiration de la session (D8).

#### Envoi

- **FR-004** : Seuls les types marqués « Push » dans la correspondance validée DOIVENT partir en push, selon le type
  et la nature de la demande ; pour les demandes de travail, seul le type `URGENT` part en push (NC-1), et la
  priorité d'une notification de garde n'entre jamais en compte. Un push
  NE DOIT être envoyé qu'à un destinataire de la notification dans l'application : les destinataires actuels sont
  inchangés, à la seule exception de `COVERAGE_TEACHER_ARRIVED`, envoyé en push au seul surveillant affecté (D4).
  Les règles du super administrateur sont inchangées.
- **FR-005** : L'envoi DOIT intervenir après la validation de la transaction qui crée la notification, comme la
  diffusion actuelle. Un échec d'envoi NE DOIT jamais bloquer, ralentir de façon perceptible ni annuler l'action
  métier, ni supprimer ou modifier la notification enregistrée.
- **FR-006** : Chaque push DOIT porter une durée de validité de 30 minutes, au-delà de laquelle le service de push
  ne doit plus le présenter ; cette durée est fixe, identique pour toutes les catégories et non réglable (NC-5).
  La spécification NE promet PAS un
  affichage dans ce délai : les services de push et les systèmes ne garantissent pas une livraison immédiate.
- **FR-007** : Le contenu d'un push DOIT se limiter au libellé du type et, si nécessaire, au nom de la classe ou à la
  référence de la demande (exemples : « Classe vide signalée — CE1 Vert », « Absence annoncée mais enseignant
  présent — CE1 Vert », « Demande urgente — D-2026-000123 »), plus les identifiants techniques nécessaires à l'ouverture de la ressource. Il NE DOIT
  contenir ni titre, ni description, ni contenu de message, ni nom d'enseignant, d'élève ou de membre du personnel,
  ni aucune autre donnée personnelle ou sensible. Des tests automatiques DOIVENT le vérifier pour chaque type
  autorisé.
- **FR-008** : Le clic sur un push DOIT ouvrir la ressource liée (demande de travail ou garde). La notification NE
  DOIT être marquée lue qu'après l'ouverture réussie de la ressource et le contrôle des droits par le serveur ; un
  clic seul ou une redirection vers la connexion NE suffisent PAS.

#### Préférences et horaires

- **FR-009** : Chaque utilisateur DOIT pouvoir activer ou désactiver séparément les quatre catégories ; les
  préférences sont enregistrées sur son compte, s'appliquent à tous ses appareils et sont relues au moment de
  chaque envoi. En cas de modifications simultanées depuis deux appareils, la dernière valeur enregistrée
  l'emporte, catégorie par catégorie (NC-9). Le signal sonore des urgences DOIT devenir une préférence du compte,
  active par défaut et identique sur tous les appareils ; une valeur « désactivé » déjà présente dans le
  navigateur est reprise une fois dans le compte, puis le réglage local n'est plus utilisé (NC-6).
- **FR-010** : Le super administrateur, et lui seul, DOIT pouvoir régler la plage horaire commune (jours de la
  semaine, heure de début, heure de fin, dans le fuseau de l'école), parmi les réglages existants de
  l'établissement (NC-10). Hors plage, aucun push n'est envoyé et aucun n'est différé, sans exception quelle que
  soit la catégorie (NC-7). Chaque modification DOIT être journalisée dans l'audit avec l'auteur, la date et les
  valeurs avant et après.

#### Données et sécurité

- **FR-011** : Pour chaque appareil abonné, seules ces données DOIVENT être conservées : adresse d'envoi
  (endpoint), clés exigées par le protocole Web Push, utilisateur, libellé de l'appareil (exemple « iPhone ·
  Safari »), date de création, date du dernier envoi réussi, date de dernière utilisation. La dernière utilisation
  est la dernière ouverture de l'application sur cet appareil par cet utilisateur avec une session valide,
  enregistrée au plus une fois par jour ; elle est distincte du dernier envoi réussi (NC-3). Un abonnement DOIT
  être supprimé sur réponse 404 ou 410, lors des événements de D8, lors d'un changement de son propre mot de passe
  (autres appareils), lors de la bascule vers un autre utilisateur, et après 90 jours sans utilisation. La
  finalité, la durée de conservation et les modalités de suppression sont documentées dans « Données personnelles
  et conservation ».
- **FR-012** : Les journaux applicatifs NE DOIVENT contenir ni le contenu des push, ni l'adresse d'envoi complète,
  ni les clés d'abonnement, ni la clé privée du serveur ; une adresse d'envoi n'y figure que tronquée ou sous forme
  d'empreinte.
- **FR-013** : Sans clés d'identification du serveur configurées, le push DOIT être désactivé (aucun abonnement
  accepté, aucun envoi tenté) et l'interface DOIT l'indiquer (« Désactivé par l'établissement »).

#### Qualité

- **FR-014** : Les tests automatisés NE DOIVENT jamais appeler un vrai service de push : réponses simulées (succès,
  404, 410, 429, 5xx, délai dépassé), comme dans la spec 010. La section « Notifications push » et le réglage de la
  plage horaire DOIVENT respecter WCAG 2.2 AA, avec contrôles automatiques d'accessibilité.

#### Exigences transversales

- **FR-015** : Un utilisateur DOIT pouvoir abonner plusieurs appareils ; chaque notification autorisée part vers
  chacun de ses abonnements actifs, sauf l'appareil au premier plan (D10).
- **FR-016** : Une nouvelle tentative ou un événement concurrent NE DOIT pas produire deux notifications visibles
  pour la même notification sur le même appareil ; un même appareil activé deux fois NE DOIT donner qu'un
  abonnement.
- **FR-017** : Les erreurs temporaires du service de push (réseau, délai dépassé, 429, 5xx) DOIVENT donner lieu à 3
  tentatives au plus, à délais croissants, sans dépasser la durée de validité ; les erreurs définitives n'en donnent
  aucune. Les tentatives en attente sont perdues si le serveur redémarre, comme la diffusion actuelle ; aucune file
  d'envoi persistante n'est créée (NC-4).
- **FR-018** : Les préférences personnelles et les réglages de l'établissement DOIVENT rester séparés :
  l'utilisateur ne peut ni contourner la plage horaire ni activer le push désactivé par l'établissement ; les
  administrateurs ne modifient pas les préférences d'un utilisateur.
- **FR-019** : Toutes les opérations sur les abonnements et préférences DOIVENT exiger une session valide et être
  contrôlées côté serveur : un utilisateur ne voit, ne crée et ne retire que ses propres abonnements ; un refus est
  journalisé sans révéler l'existence de l'abonnement d'un autre.
- **FR-020** : La suppression d'un abonnement lors d'une déconnexion, d'une réinitialisation du mot de passe, d'un
  changement de son propre mot de passe (autres appareils), d'une désactivation ou d'une bascule vers un autre
  utilisateur DOIT être effective avant tout envoi ultérieur, y compris les nouvelles tentatives déjà programmées (même transaction que la
  fermeture des sessions quand
  elle existe).

### Exigences non fonctionnelles

- **NFR-001 — Sécurité des adresses d'envoi** : le serveur NE DOIT envoyer qu'à des adresses en HTTPS de services de
  push reconnus, après validation (format, longueur) ; toute autre adresse est refusée à l'abonnement, pour éviter
  que le serveur soit utilisé pour joindre des adresses internes.
- **NFR-002 — Clés** : la clé privée d'identification du serveur vient de la configuration d'environnement, n'est
  jamais exposée au navigateur, ni journalisée, ni versionnée ; seule la clé publique est fournie à l'interface.
- **NFR-003 — Composant d'arrière-plan** : il est servi par l'application elle-même, avec la portée la plus
  restreinte possible, compatible avec la politique de sécurité du contenu actuelle ; il NE DOIT mettre en cache
  aucune réponse de l'API, aucune donnée authentifiée ni aucun contenu de notification ; une nouvelle version
  remplace l'ancienne sans action de l'utilisateur.
- **NFR-004 — Disponibilité** : sans push (désactivé, non pris en charge, service en panne), le fonctionnement
  actuel des notifications dans l'application est inchangé (SC-005).
- **NFR-005 — Interface** : la section « Notifications push » et le réglage de la plage horaire sont utilisables de
  320 px de large à l'ordinateur, sans défilement horizontal, en portrait et en paysage, au toucher et au clavier ;
  états (chargement, vide, erreur, succès) et messages d'erreur cohérents avec le reste de l'application ; tests
  automatisés sur plusieurs tailles d'écran et orientations.
- **NFR-006 — Journalisation** : les erreurs d'envoi sont journalisées avec le type de notification, le code de
  réponse et une empreinte de l'abonnement, sans contenu ni donnée personnelle.

### Données personnelles et conservation (principe IV de la constitution)

- **Données** : adresse d'envoi de l'appareil (identifiant pseudonyme attribué par le service de push), clés
  d'abonnement, lien vers l'utilisateur, libellé de l'appareil, dates de création, de dernier envoi réussi et de
  dernière utilisation ; préférences par catégorie.
- **Finalité** : prévenir le personnel, sur ses appareils, des événements des quatre catégories.
- **Durée** : jusqu'au retrait par l'utilisateur, à un événement de D8, à un changement de son propre mot de passe
  (autres appareils), à la bascule vers un autre utilisateur, à une réponse 404/410, ou à 90 jours sans
  utilisation ; les préférences suivent la durée de vie du compte.
- **Destinataires** : les services de push des éditeurs (Google, Apple, Mozilla, Microsoft ou compatibles) reçoivent
  le message chiffré et les métadonnées nécessaires à l'acheminement (adresse d'envoi, heure, taille, durée de
  validité, adresse du serveur) ; ils ne peuvent pas lire le contenu.
- **Activation** : sur décision de l'établissement et après mention au registre des traitements (D9).

### Entités clés

- **Abonnement push d'appareil** : un appareil (navigateur) autorisé à recevoir les push d'un utilisateur ; adresse
  d'envoi unique, clés, utilisateur, libellé, dates (création, dernier envoi réussi, dernière utilisation). Un
  utilisateur en a zéro ou plusieurs ; une adresse d'envoi n'appartient qu'à un utilisateur.
- **Préférences push** : pour un utilisateur, l'état de chacune des quatre catégories et le signal sonore des
  urgences. Une ligne par utilisateur au plus ; valeurs par défaut tant qu'il n'a rien modifié.
- **Plage horaire d'envoi** : réglage global de l'établissement (jours, heure de début, heure de fin), dans le
  mécanisme de réglages existant et son audit ; ce n'est pas une nouvelle table.
- **Notification** (existante, **inchangée**) : la source de chaque push ; sa catégorie se déduit de son type et de
  la nature de la demande liée.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : En préproduction, sur un appareil compatible, verrouillé et abonné (au moins un Android avec un
  navigateur compatible et un iPhone avec l'application sur l'écran d'accueil, en Wi-Fi ou en 4G, sans mode
  économie d'énergie), un push est affiché en moins de 10 secondes après l'action qui le provoque dans 95 % d'au
  moins 20 envois par plateforme. C'est une mesure dans ces conditions, pas une garantie : la livraison dépend des
  services de push et des systèmes.
- **SC-002** : 0 push envoyé pour un type non autorisé, une catégorie désactivée, en dehors de la plage horaire, ou
  à un utilisateur qui n'est pas destinataire de la notification dans l'application (tests automatisés couvrant
  chaque type de l'énumération).
- **SC-003** : Après une déconnexion explicite, 0 push n'est envoyé à l'appareil concerné pour cet utilisateur ; de
  même après la désactivation du compte ou la réinitialisation de son mot de passe, pour tous ses appareils, et
  après un changement de son propre mot de passe, pour ses autres appareils.
- **SC-004** : Un utilisateur désactive une catégorie en 3 actions au plus depuis l'ouverture de « Mon profil ».
- **SC-005** : Avec le push désactivé ou en panne simulée, 100 % des tests existants sur les notifications dans
  l'application passent sans modification, et les actions métier ne sont pas ralenties de façon perceptible.
- **SC-006** : 0 titre, description, contenu de message ou nom de personne dans les contenus de push générés, pour
  chaque type autorisé (test automatique).

## Hypothèses

- L'application est servie en HTTPS (production, démonstration en ligne) ou sur la machine locale, ce qu'exigent les
  navigateurs pour le push.
- Le fuseau de l'école (`SCHOOL_TIMEZONE`) vaut `Africa/Tunis` dans la configuration de l'établissement ; le défaut
  du code (`Europe/Paris`) n'est pas modifié par cette spec.
- À la première activation, les quatre catégories sont actives (proposition) ; l'utilisateur les règle ensuite.
- Plage horaire par défaut, avant tout réglage : lundi–vendredi, 07:30–18:30 (exemple de D6). Le super
  administrateur l'ajuste avant l'activation du push s'il veut couvrir les signalements faits avant 07:30.
- Les actions de l'utilisateur sur ses propres appareils et préférences ne sont pas journalisées dans l'audit
  (réglages personnels) ; la plage horaire, réglage d'établissement, l'est (FR-010).
- Un nombre maximal d'appareils par utilisateur est fixé au plan, pour limiter les abus.
- Aucune modification des règles métier, des destinataires dans l'application, du modèle `Notification` ni de la
  diffusion Socket.IO ; le push est un diffuseur de plus après validation de la transaction.
- Les tests de bout en bout vérifient l'interface et l'abonnement avec un service simulé ; l'affichage réel sur
  appareils est vérifié en préproduction (SC-001).

## Hors périmètre

- Regroupement des notifications, mécanisme d'escalade, notifications par e-mail ou SMS, application native.
- Nouveau modèle générique de notification, notifications sans demande liée, refonte du système existant.
- Modification des destinataires actuels (hors la règle push de D4).
- Plages horaires individuelles, push différé à l'ouverture de la plage.
- Fonctionnement hors ligne de l'application.

## Clarifications

### Session 2026-11-09

Les dix points ouverts (NC-1 à NC-10) ont été tranchés par l'utilisatrice, qui a validé chaque proposition. Les
exigences et scénarios ci-dessus en tiennent compte.

- **NC-1** — Q : catégorie Urgent : le type `URGENT` seul, ou toute notification d'une demande de travail urgente ?
  → R : **le type `URGENT` seul.** Pour une demande urgente, le code remplace déjà « Nouvelle demande » et « Demande
  affectée » par `URGENT` ; messages, changements de statut, retards et clôtures restent dans l'application.
- **NC-2** — Q : liste exacte des types de garde envoyés en push ? → R : **le tableau de correspondance**, avec
  `COVERAGE_TAKEOVER_EXPIRED` et `COVERAGE_ESCALATED` dans Garde non pourvue ; `COVERAGE_RELIEVED` et les types
  génériques `CLOSED`, `CANCELLED`, `STATUS_CHANGED` sur une garde restent dans l'application.
- **NC-3** — Q : que signifie « dernière utilisation » d'un abonnement ? → R : **la dernière ouverture de
  l'application sur cet appareil par cet utilisateur avec une session valide**, enregistrée au plus une fois par
  jour, distincte du dernier envoi réussi.
- **NC-4** — Q : nouvelles tentatives et redémarrage du serveur ? → R : **3 tentatives au plus**, à délais
  croissants, dans la durée de validité ; **perdues au redémarrage**, comme la diffusion Socket.IO ; **pas de file
  d'envoi persistante.**
- **NC-5** — Q : durée de validité fixe ou réglable ? → R : **fixe, 30 minutes**, identique pour toutes les
  catégories.
- **NC-6** — Q : son des urgences sur le compte ou par appareil ? → R : **préférence du compte, active par défaut**,
  identique sur tous les appareils ; une valeur « désactivé » trouvée dans le navigateur est reprise une fois.
- **NC-7** — Q : exceptions à la plage horaire ? → R : **aucune exception** ; l'heure d'ouverture se choisit en
  conséquence (les signalements arrivent souvent avant 07:30).
- **NC-8** — Q : appareils partagés ? → R : (a) **l'abonnement passe au dernier utilisateur** qui active le push sur
  le navigateur ; (b) **changer son propre mot de passe supprime les abonnements de ses autres appareils**, comme
  leurs sessions ; (c) **la section recommande la déconnexion explicite** sur un appareil partagé, sans nouveau
  mécanisme.
- **NC-9** — Q : modifications simultanées des préférences ? → R : **la dernière valeur enregistrée l'emporte**,
  catégorie par catégorie ; les autres appareils affichent la valeur à jour à leur prochain affichage.
- **NC-10** — Q : qui règle la plage horaire ? → R : **le super administrateur seul**, dans les réglages existants de
  l'établissement.
