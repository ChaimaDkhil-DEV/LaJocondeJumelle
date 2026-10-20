# Feature Specification: Retards et absences des enseignants, affectation des surveillants

**Feature Branch**: `004-retards-affectation-surveillants`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Évolution de l'application existante : gestion des retards/absences
des enseignants et affectation des surveillants. Continuité de l'existant (réutiliser et adapter,
ne rien recréer, ne rien casser). Le rôle « responsable » devient « admin » (surveillante générale
/ administration), partout. Rôles : admin (supervise, reçoit les informations, assigne les
surveillants), surveillant (rattaché à un étage, 1 ou 2 par étage, fait des tours et garde les
classes sans enseignant), enseignant (signale à l'avance un retard ou une absence). Trois parcours :
retard/absence prévu signalé par l'enseignant pour aujourd'hui ou demain ; classe vide détectée par
le surveillant pendant son tour ; affectation directe créée par l'admin. Règles : trois sources
d'affectation, surveillant occupé sur le même créneau non proposé, statuts en attente / assignée /
en cours / terminée / annulée, historique conservé pour consultation et statistiques, seul l'admin
assigne et crée des affectations. Inclure un état des lieux (existant / à modifier / manquant) et
les points ambigus sous forme de questions, sans suppositions."

## Méthode

- L'état des lieux ci-dessous a été établi en lisant le code de la branche
  `003-corrections-audit-technique` (2026-10-16). Les références de fichiers servent au plan ; les
  exigences, elles, restent fonctionnelles.
- Conformément à la demande, **aucun point ambigu n'est tranché par supposition** : chaque
  ambiguïté a été consignée dans « Questions à clarifier » (Q1 à Q21). Toutes sont tranchées au
  2026-10-16 ; les réponses font foi dans « Clarifications ».
- Vocabulaire : dans ce document, **« affectation »** désigne le fait qu'un surveillant garde une
  classe privée d'enseignant sur un créneau. **« Garde »** désigne la fonctionnalité existante
  « Gardes » (couverture de classe, lot 2). Une affectation **est** une garde enrichie (Q2).

## Clarifications

### Session 2026-10-16

- Q1 : Sens du renommage « responsable » → « admin » ? → A : Le rôle « Responsable » devient
  « Admin » et conserve ses droits actuels. « Super administrateur » et « Admin » restent deux
  rôles distincts.
- Q2 : Rapport avec les gardes existantes ? → A : On enrichit la garde existante (source, étage,
  enseignant concerné). La diffusion avec prise par le premier volontaire est supprimée : seul
  l'admin assigne un surveillant, qui est notifié de son affectation. Les tests existants des
  gardes sont adaptés. Exception unique : quand un surveillant déclare lui-même une classe vide
  (il est déjà sur place), l'affectation est créée directement à son nom, avec la source
  « signalement surveillant », et l'admin en est informée.
- Q3 : Enseignant et surveillant, rôles ou fonctions ? → A : Ils restent des employés,
  identifiés par un groupe (« Enseignants », « Surveillants »), en réutilisant les groupes
  existants. Un employé peut appartenir à plusieurs groupes. Le rattachement d'un surveillant à
  un étage est une donnée supplémentaire de son profil.
- Q1 (suite) : Super administrateur, compte de démo, specs passées, libellés ? → A : Le super
  administrateur (propriétaire de l'école) a tous les accès et peut jouer tous les rôles dans ces
  parcours (Admin, Surveillant, Enseignant : recevoir les demandes, assigner, créer des
  affectations, etc.). Le compte de démonstration `responsable` est renommé `admin` (identifiant,
  nom affiché, données d'initialisation). Les spécifications 001 et 003 ne sont pas réécrites :
  on y ajoute seulement une note indiquant que « Responsable » est devenu « Admin », la
  terminologie de la spécification courante faisant foi. L'espace « Administration » est renommé
  « Administrateur » ; le rôle du propriétaire s'affiche « Super administrateur » ; dans
  l'interface, « Admin » ne désigne jamais le propriétaire.
- Q2 (suite) : Sort des mécanismes de garde et des gardes en cours ? → A : Présence par QR code
  ou photo, prolongation, relève et délais sont conservés sur les affectations sans changement
  de fonctionnement ; seule la façon d'attribuer une garde change (assignation par l'admin au
  lieu de la diffusion). Les gardes encore ouvertes (en diffusion) au moment de la mise à jour
  sont conservées et apparaissent chez l'admin « en attente » pour qu'elle assigne un
  surveillant ; les gardes déjà prises par un volontaire restent telles quelles.
- Q3 (suite) : Groupe « Surveillants/Remplaçants » ? → A : Il est renommé « Surveillants » (pas
  de nouveau groupe), avec conservation des membres actuels. Si certains membres ne sont pas des
  surveillants (remplaçants), le cas est signalé avant la migration.
- Q2 (compléments) : Délai de prise en charge et gardes « Non pourvues » ? → A : Le délai de
  prise en charge (2 minutes par défaut, réglable) mesure désormais le temps laissé à l'admin pour
  assigner un surveillant. Il s'applique aux demandes à échéance proche (retard ou absence prévu
  pour aujourd'hui) ; aucun délai pour une classe vide déclarée par un surveillant (déjà « en
  cours ») ; pour un signalement portant sur demain, pas de délai court mais un rappel le matin
  si rien n'est assigné. À l'expiration, une alerte est envoyée à l'admin ; sans réponse, elle
  est escaladée au super administrateur ; la demande reste « en attente » et est affichée en
  priorité. Lors de la mise à jour, les gardes « Non pourvues » dont le créneau n'est pas passé
  repassent « en attente » ; celles dont le créneau est passé restent « non pourvues » dans
  l'historique (conservées pour les statistiques).
- Q2 (réglages) : Rappel, escalade, créneau lointain, statut « non pourvue » ? → A : Le rappel
  part à 7 h 00 (heure réglable) le jour de la date concernée, vers l'admin uniquement, et
  seulement si la demande est encore « en attente ». L'alerte d'expiration est escaladée au super
  administrateur si l'admin n'a pas répondu 5 minutes après (durée réglable) ; seules
  l'assignation d'un surveillant, le refus ou l'annulation de la demande par l'admin valent
  réponse (avoir vu l'alerte ne suffit pas) — *le refus a depuis été supprimé, voir la
  correction ci-dessous*. Le délai de 2 minutes ne s'applique que si le début
  du créneau est dans moins de 60 minutes (seuil réglable) ; pour un créneau plus lointain, la
  demande reste « en attente » et le délai démarre quand le créneau passe sous le seuil, avec la
  même alerte et la même escalade ; si le créneau a déjà commencé, le délai s'applique
  immédiatement. « Non pourvue » est un sixième statut, final, posé quand le créneau est passé
  sans qu'aucun surveillant n'ait été assigné ; il se distingue d'« annulée » (décision de
  l'admin ou de l'enseignant) dans les statistiques.
- ~~Q2 (refus) : statut distinct « refusée »~~ — *annulée par la correction ci-dessous.*
- Correction (refus supprimé) : Quelles actions sur une demande ? → A : Il n'y a pas de refus
  (ni statut « refusée », ni motif, ni notification de refus) ; six statuts : en attente,
  assignée, en cours, terminée, annulée, non pourvue. « En attente » = demande reçue, aucun
  surveillant assigné ; l'action de l'admin (ou du super administrateur) est d'assigner un
  surveillant. Une fois « assignée », l'admin (ou le super administrateur) peut seulement
  annuler, motif facultatif (ex. l'enseignant arrive finalement à l'heure) ; le surveillant
  assigné est alors notifié que son affectation est levée. Le surveillant assigné ne peut ni
  accepter, ni refuser, ni annuler : l'assignation est un ordre ; il met seulement à jour
  l'avancement (« en cours », puis « terminée »). Une demande jamais assignée passe « non
  pourvue » quand le créneau est passé. L'escalade ne s'arrête que par l'assignation (ou
  l'annulation, si elle est permise avant assignation).
- Annulation avant assignation (FR-008b) → A : Option 1. Sur une demande « en attente »,
  l'admin (ou le super administrateur) peut assigner un surveillant ou annuler la demande (motif
  facultatif) — ce n'est pas un refus, c'est la fin de la demande, qui devient « annulée ».
  L'enseignant demandeur peut retirer sa propre demande tant qu'elle n'est pas assignée
  (« annulée », motif facultatif). L'escalade s'arrête dès que la demande est assignée ou annulée.
- Q12 (compléments) → A : L'enseignant peut modifier son signalement (date, créneau, classe,
  motif) tant qu'il est « en attente » ; chaque modification est tracée dans l'historique. Une
  fois assigné, il ne le modifie plus : il prévient l'admin, qui annule ou réassigne. Une classe
  vide déclarée par erreur (affectation « en cours ») ne peut être annulée que par l'admin (ou le
  super administrateur), motif facultatif ; le surveillant ne peut que prévenir l'admin. Une
  affectation annulée ne compte pas comme un retard réel dans les statistiques : elle est
  comptée à part dans « annulée ».
- Réassignation (Q12, suite) → A : Sur une affectation « assignée », l'admin (ou le super
  administrateur) peut l'annuler (motif facultatif) ou la réassigner à un autre surveillant
  disponible ; seule l'admin décide. L'ancien surveillant est notifié que son affectation est
  levée, le nouveau reçoit l'ordre, le statut reste « assignée », et le changement est tracé
  (qui, quand, ancien et nouveau surveillant). Sur une affectation « en cours », l'admin peut
  aussi réassigner (ex. libérer un surveillant qui a déclaré une classe vide) : elle reste « en
  cours », le nouveau surveillant est notifié, et le surveillant d'origine n'est libéré qu'une
  fois le nouveau présent dans la classe, confirmé par le mécanisme de relève existant.
  L'annulation d'une affectation « en cours » reste réservée à l'admin. La réassignation
  existante des gardes est conservée, mais seule l'admin peut la déclencher.
- Q9 (enseignant concerné) → A : Le surveillant n'est pas obligé d'indiquer l'enseignant ; la
  déclaration n'est jamais bloquée par ce champ. L'application pré-remplit l'enseignant prévu
  d'après l'emploi du temps (classe + créneau) ; le surveillant le confirme d'un geste, le
  corrige ou le laisse vide. Sans emploi du temps pour cette classe et ce créneau, le champ reste
  vide et facultatif. Si l'enseignant est renseigné, il est identifié pour les statistiques ;
  sinon l'affectation est comptée « classe sans enseignant, enseignant non précisé ». L'admin
  peut compléter ou corriger l'enseignant après coup, chaque correction étant tracée. Si
  l'enseignant identifié avait déjà signalé un retard pour ce créneau, la déclaration est
  rattachée à sa demande existante pour éviter un doublon (voir Q13).
- Emploi du temps → A : Reporté à un lot ultérieur ; cette fonctionnalité n'en crée aucun. Le
  champ enseignant d'une déclaration de classe vide est facultatif et vide par défaut ; le
  surveillant choisit dans la liste des enseignants (groupe « Enseignants ») ou le laisse vide ;
  aucun pré-remplissage pour l'instant, mais le champ doit permettre de l'ajouter plus tard sans
  refonte.
- Q5 (créneau) → A : Plage libre, sans grille fixe : le demandeur saisit la date, l'heure de
  début et l'heure de fin (ou une durée).
- Q6 (classes de l'enseignant) → A : L'enseignant choisit parmi toutes les classes de l'école,
  sans restriction ; il n'existe pas de lien enseignant-classe pour l'instant.
- FR-015d (rattachement) → A : Sans emploi du temps, le rattachement automatique se fonde sur
  l'enseignant, la classe et un chevauchement de plage horaire. Si une demande correspondante
  existe et n'est pas encore assignée, la déclaration s'y rattache : l'affectation passe « en
  cours » avec le surveillant déclarant, sans duplication.
- Q13 (doublons) → A : Demande correspondante déjà « assignée » à un autre surveillant :
  l'affectation est conservée avec son surveillant, qui reste responsable ; le déclarant est
  informé de qui est assigné ; l'admin est notifiée pour décider (réassigner ou laisser) ; rien
  n'est modifié automatiquement. Demande correspondante déjà « en cours » : la déclaration est
  rattachée à l'affectation existante, sans nouvelle affectation ; le surveillant présent reste
  responsable ; l'admin est informée. Deux surveillants déclarent la même classe : le premier
  crée l'affectation « en cours » ; le second y est rattaché et informé que la classe est déjà
  prise en charge ; aucune seconde affectation ; l'admin décide s'il reste en renfort ou reprend
  sa tournée. Enseignant non précisé mais demande existante sur la même classe et une plage qui
  chevauche : pas de rattachement automatique ; l'application propose le rattachement à l'admin,
  qui confirme ou refuse ; tant qu'elle n'a pas confirmé, l'affectation du surveillant reste
  distincte ; toute fusion est tracée.
- Q13 (renfort et statistiques) → A : Un surveillant en renfort est « occupé » tant qu'il est
  dans la classe (non proposé ailleurs) ; il redevient disponible dès que l'admin le libère, ou
  automatiquement quand l'affectation passe « terminée » ; sans décision de l'admin après
  10 minutes (durée réglable), un rappel lui est envoyé. Si l'admin refuse un rattachement
  proposé, les deux affectations restent distinctes et comptent chacune comme un événement.
  Tant qu'une proposition est en suspens, les deux affectations sont marquées « doublon
  possible » et ne comptent qu'une fois ; le décompte définitif a lieu à la décision (confirmé :
  un événement ; refusé : deux). La proposition reste visible chez l'admin jusqu'à décision ; si
  les deux affectations sont terminées sans décision, elle lui est présentée une dernière fois.
  Toute décision est tracée.
- Q13 (derniers points) → A : Si l'admin ne décide pas après la dernière présentation, les deux
  affectations restent comptées une seule fois, avec la mention « non tranché » ; l'admin (ou le
  super administrateur) peut décider à tout moment, y compris après coup ; le décompte est alors
  corrigé et la correction tracée ; les statistiques distinguent les doublons « non tranchés »
  des chiffres définitifs. Le rappel « renfort » est répété toutes les 10 minutes (réglable)
  tant que l'admin n'a pas décidé, dans la limite de 3 rappels (plafond réglable) ; après le
  dernier, l'alerte est transmise au super administrateur ; sans décision, le renfort reste
  occupé jusqu'à ce que l'affectation passe « terminée », puis est libéré automatiquement.
- Q7 (étages) → A : Un surveillant est rattaché à un seul étage (champ de son profil) ; chaque
  classe appartient à un étage. Pour une classe, les surveillants de son étage sont proposés en
  premier ; l'admin (ou le super administrateur) peut assigner un surveillant d'un autre étage.
- Q8 (disponibilité) → A : Un surveillant est disponible s'il n'a aucune affectation active
  (assignée ou en cours) dont la plage chevauche la plage demandée ; le renfort compte comme
  occupé. Liste triée : surveillants de l'étage de la classe d'abord, puis les autres. Pas de
  gestion des congés ou absences des surveillants dans ce lot.
- Q10 (fin d'une affectation) → A : Une affectation se termine quand le surveillant la passe
  « terminée ». Une demande jamais assignée dont le créneau est passé devient « non pourvue ».
  Une affectation assignée ou en cours dont le créneau est fini sans clôture déclenche un rappel
  au surveillant, puis à l'admin s'il reste sans réponse.
- Q11 (délais de signalement) → A : Aujourd'hui ou demain uniquement, jamais pour une plage déjà
  entièrement passée ; aucun délai minimum (le signalement de dernière minute est accepté).
- Q14 (notifications) → A : Notification dans l'application pour tous les événements du module ;
  alerte mise en évidence (sonore ou visuelle) pour les cas urgents : classe vide déclarée,
  expiration du délai, escalade. Canaux externes (SMS, e-mail) hors périmètre sauf s'ils existent
  déjà — vérifié dans le code : aucun n'existe (ni e-mail, ni SMS, ni notification push).
- Q15 (statistiques) → A : Accessibles à l'admin et au super administrateur : nombre de retards
  par enseignant, par classe, par période, durée moyenne, taux de « non pourvue ». Les
  « annulées » et les « doublons non tranchés » sont comptés à part. Export hors périmètre.
- Q16 (RGPD) → A : Les statistiques par enseignant sont des données personnelles, réservées à
  l'admin et au super administrateur. Un enseignant ne voit que ses propres demandes. Durée de
  conservation : une année scolaire (réglable), à valider avec la direction ; au-delà, les
  données sont supprimées ou anonymisées.
- Q17 (durée) → A : Mesurée du passage « en cours » jusqu'à « terminée » ; pour une classe vide
  déclarée, elle commence à la déclaration.
- Q18 (accès) → A : Les autres employés ne voient rien de ce module ; seuls y ont accès l'admin,
  le super administrateur, le surveillant (ses affectations) et l'enseignant (ses demandes).
- Q19 (tour d'étage) → A : Hors périmètre : aucun parcours, pointage ni suivi de tournée ; le
  surveillant déclare seulement une classe vide quand il en trouve une.
- Q20 (supports) → A : L'application existante, sans nouveau support ; les changements
  s'appliquent à tous les supports existants — vérifié dans le code : une seule application web
  adaptative (pas d'application mobile native ni d'application installable), utilisable sur
  smartphone, tablette et ordinateur.
- Q16 (RGPD et audit) → A : Anonymisation, jamais de suppression de l'audit. Au bout d'une
  année scolaire (réglable), l'enseignant et le motif sont anonymisés dans les données du module ;
  les événements (date, classe, durée, statut) restent pour les statistiques globales. Le journal
  d'audit est exclu de la purge et reste non modifiable (constitution, principe V). Le
  surveillant voit la classe, le créneau et une raison courte, mais pas le motif détaillé saisi
  par l'enseignant, réservé à l'admin et au super administrateur.
- Q21 (surveillant occupé qui trouve une classe vide) → A : L'affectation est créée quand même à
  son nom, « en cours », car il ne peut pas laisser les élèves sans adulte ; il a alors deux
  affectations actives qui se chevauchent, cas autorisé uniquement pour cette exception. L'admin
  est alertée immédiatement (alerte mise en évidence) pour envoyer un autre surveillant ; elle
  réassigne l'une ou l'autre des deux affectations. Tout est tracé.
- Q18 (périmètre des admins) → A : Tous les admins (anciens responsables) ont accès au module,
  sans restriction par catégorie de garde ; la règle actuelle liée à la diffusion disparaît.
- Q8 (disponibilité déclarée) → A : La disponibilité déclarée existante reste prise en compte :
  un surveillant « Indisponible » ou « Absent » n'est pas proposé, en plus de la règle de
  chevauchement des affectations.
- Q7 (gestion des étages) → A : Le super administrateur crée les étages et y rattache les
  classes ; l'admin ne modifie pas cette structure. Étage sans surveillant : simple
  avertissement, sans blocage (les surveillants d'autres étages restent assignables). Aucune
  limite haute du nombre de surveillants par étage.
- Q10 (rappels de clôture) → A : Rappel au surveillant 10 minutes après la fin du créneau
  (réglable), puis passage à l'admin après 10 minutes supplémentaires sans réponse (réglable).
- Décisions du plan validées (R3, R10, R11) → A : Une garde antérieure sans heure de fin a pour
  fin réputée la fin de la journée locale (pas de rappel de clôture avant). Une déclaration de
  classe vide n'exige pas de preuve de présence ; un QR code scanné est enregistré s'il est
  fourni. Sans admin actif, les notifications destinées aux admins vont aux super
  administrateurs (gardes et affectations seulement, voir Q23) ; l'enseignant auteur est notifié
  quand un surveillant est assigné à sa demande
  (FR-017a).
- Q16 (raison courte) → A : La « raison courte » est uniquement le type de signalement :
  retard, absence ou classe vide ; l'enseignant ne saisit aucun texte supplémentaire. Le
  surveillant affecté voit la classe, l'étage, le créneau et le type, jamais le motif détaillé,
  réservé à l'admin et au super administrateur. Pour une affectation directe, le type est choisi
  par l'admin ; pour une classe vide déclarée par un surveillant, le type est « classe vide ».
- Q5 (absence d'une journée entière) → A : La gestion des absences est reportée à un lot
  ultérieur. Ici, une demande concerne une seule classe et une seule plage horaire ; un
  enseignant absent plusieurs heures ou pour plusieurs classes crée une demande par classe et
  par plage (ou l'admin crée les affectations directement). Chaque demande aboutit à
  l'assignation d'un surveillant. Le modèle doit permettre de regrouper plus tard plusieurs
  demandes sous une même absence sans refonte.
- Q4 : Articulation avec les états actuels des gardes ? → A : Deux niveaux : le statut principal
  (les six) et un sous-état affiché en badge, qui ne change pas le statut principal. Sous-états
  conservés : « En route » et « En retard » sous « assignée » ; « Relève demandée » sous « en
  cours » ; « Clôturée après validation » sous « terminée ». Filtres, statistiques et alertes se
  fondent sur le statut principal. Les anciennes gardes terminées sont migrées vers « terminée »,
  leur ancien libellé conservé comme sous-état ; aucune donnée d'historique n'est supprimée ni
  réécrite. Un contrôle avant migration signale tout ancien statut sans équivalent évident.
- Q9 : Statut initial d'une affectation créée par déclaration de classe vide ? → A : Elle démarre
  directement « en cours » (le surveillant est déjà dans la classe) et passe « terminée » à
  l'arrivée de l'enseignant.

### Session 2026-10-16 (mise à jour après fusion des PR #6, #7 et #9)

Cette spécification a été écrite avant trois évolutions désormais dans `master` (`59f70fb`) :
demande terminée en lecture seule (PR #6), notifications du super administrateur (PR #7), mode de
routage par catégorie (PR #9). Les réponses ci-dessous font foi et priment sur les passages plus
anciens qui les contrediraient.

- Q22 (droits de l'admin sur les demandes de travail) → A : Les droits de l'admin (ex-responsable)
  sur les demandes de travail suivent le mode de routage de la catégorie, et non plus « exactement
  les droits du responsable ». Via l'administration : les admins responsables de la catégorie
  valident ou refusent (motif obligatoire), affectent, réaffectent, changent la priorité et écrivent
  dans la discussion. Direct et entre enseignants : tous les admins consultent en lecture seule
  (aucune action, aucun message, aucune notification, retards compris). Dans tous les modes, un
  admin peut créer une demande dans toute catégorie active.
- Q23 (repli des notifications vers le super administrateur) → A : Le repli « sans admin actif,
  les notifications des admins vont aux super administrateurs » ne vaut que pour les gardes et les
  affectations de surveillants. Sur les demandes de travail, le super administrateur n'est notifié
  que des demandes urgentes, sans employé affecté (délai bientôt dépassé) ou en retard, une fois par
  demande et par type, et jamais sur une demande terminée (PR #7).
- Q24 (référence de non-régression) → A : La suite de tests de `master` après la PR #9 sert de
  référence : les adaptations faites par les PR #6, #7 et #9 (lecture seule des demandes terminées,
  notifications du super administrateur, routage) ne sont pas des régressions.

## État des lieux

> Établi le 2026-10-16 sur la branche 003 ; complété le même jour après la fusion des PR #6, #7 et
> #9 (lignes « Demandes de travail », « Notifications » et « Droits »).

### Ce qui existe déjà

| Domaine | Existant constaté | Où |
| --- | --- | --- |
| Rôles | Trois rôles techniques : `SUPER_ADMIN` (« Super administrateur »), `MANAGER` (affiché « Responsable »), `EMPLOYEE` (« Employé »). Aucun rôle « enseignant » ni « surveillant » : ce sont des employés, distingués par un intitulé de poste libre et, pour les surveillants, par l'appartenance à un groupe. | `backend/prisma/schema.prisma:15-19`, `frontend/src/features/admin/labels.ts:4-8` |
| Comptes de démonstration | `superadmin`, `responsable` (« Responsable administratif »), `enseignante`, `surveillant`, `remplacant`, etc. | `backend/prisma/seed.ts:27-38`, `e2e/support/accounts.ts` |
| Gardes (couverture de classe, lot 2) | Un responsable ou le super administrateur crée une demande de garde : classe, groupes ciblés, heure de début, durée (ou « jusqu'à l'arrivée de l'enseignant »), nom de l'enseignant absent **en texte libre**, note, message vocal. La garde est diffusée aux membres disponibles des groupes ciblés (ex. « Surveillants/Remplaçants ») ; **le premier qui accepte la prend**. Le responsable peut aussi assigner, réassigner, élargir, libérer, valider, annuler. Le surveillant affecté part, confirme sa présence par QR code et/ou photo, peut prolonger, demander une relève, être relevé. Délais suivis (prise en charge 2 min, arrivée 5 min) avec passage automatique « Non pourvue » / « En retard ». | `backend/src/coverage/`, `frontend/src/features/coverage/`, `docs/coverage-migration.md` |
| Statuts des gardes | Diffusée, Acceptée, En route, En retard, En poste, Relève demandée, Non pourvue, Terminée, Clôturée, Annulée. | `RequestStatus` dans `schema.prisma`, `coverage-state-machine.ts` |
| Disponibilité | Chaque employé a une disponibilité (Disponible / Indisponible / Absent — Absent réservé aux responsables). Un employé déjà engagé sur une garde qui chevauche le créneau n'est pas proposé. | `backend/src/coverage/coverage-availability.ts` |
| Classes | Liste des classes (nom, salle en texte libre, active, QR code imprimable révocable), gérée par le super administrateur. **Pas d'étage.** | modèle `SchoolClass`, écran `/admin/classes` |
| Groupes d'employés | Groupes (ex. « Surveillants/Remplaçants ») gérés par le super administrateur, ciblés par les gardes. | `EmployeeGroup`, écran `/admin/groupes` |
| Notifications | Dans l'application uniquement, en temps réel (ni push, ni e-mail — choix explicite du lot 1). Chaque notification est rattachée à une demande. Types de garde : nouvelle, prise, acceptée, présence, libérée, relève demandée, en retard, non pourvue, prolongée, relevée. Les responsables de la catégorie de garde, le demandeur et, pour certains événements, tous les super administrateurs sont notifiés. Demandes de travail (PR #7) : le super administrateur n'est notifié que des demandes urgentes, sans employé affecté ou en retard, une fois par demande et par type (filtre côté serveur, alertes planifiées) ; les gardes ne sont pas concernées. | `backend/src/notifications/`, `backend/src/notifications/super-admin-policy.ts`, `frontend/src/features/notifications/` |
| Demandes de travail (routage, PR #9) | Chaque catégorie a un mode de routage : via l'administration (validation par les responsables de la catégorie, puis affectation), direct (vers le service, destinataire seul choisi d'office) ou entre enseignants (vers un collègue choisi, absent signalé sans blocage). En direct et entre enseignants, les responsables et le super administrateur consultent en lecture seule, sans notification ; onglet « Suivi » de la liste. Une demande terminée, refusée ou annulée est en lecture seule (PR #6). | `Category.routingMode`, `backend/src/requests/domain/access-policy.ts`, `visibility.ts` |
| Historique et suivi | Historique non modifiable de chaque demande, journal d'audit non modifiable, tableau de suivi des gardes et export CSV (durées comprises), historique « mes gardes » côté employé. | `RequestEvent`, `AuditLog`, `/admin/suivi` |
| Droits | Contrôle côté serveur : gestion des gardes ouverte au super administrateur et aux responsables d'une catégorie de garde ; administration (comptes, catégories, classes, groupes, réglages, journal) réservée au super administrateur. Demandes de travail : droits des responsables selon le mode de routage (Q22) ; un responsable peut créer dans toute catégorie active. | `coverage-policy.ts`, `access-policy.ts`, `SuperAdminGuard` |
| Écrans | `/gardes` : onglets En cours / Équipe / Terminées pour les gestionnaires ; À prendre / Ma garde / Historique pour les membres de groupe ; `/gardes/nouvelle` ; `/gardes/:id` ; `/gardes/presence` (QR). Menu « Gardes » visible des membres de groupe et des gestionnaires, « Administration » du seul super administrateur. | `frontend/src/app/routes.tsx`, `AppLayout.tsx` |

### Ce qui doit être modifié

| Élément | Écart avec le besoin |
| --- | --- |
| Libellé et rôle « Responsable » | Devient « Admin » partout (données, droits, interface, textes), avec les mêmes droits (sur les demandes de travail : ceux du mode de routage, Q22) ; textes ajoutés depuis à renommer aussi : onglet « Suivi », modes de routage dans l'administration des catégories, onglet Employés du tableau de bord ; « Super administrateur » reste distinct (Q1). Le mot « admin » désigne déjà aujourd'hui l'espace du **super administrateur** (menu « Administration », écrans `/admin/*`) : cet espace est renommé « Administrateur » et « Admin » ne désigne jamais le propriétaire. Le compte de démonstration `responsable` devient `admin` ; les spécifications 001 et 003 reçoivent seulement une note. Le terme apparaît **415 fois dans 82 fichiers** (décompte du 2026-10-16 sur `master` après la PR #11, hors spécifications) (code, messages d'erreur, compte de démonstration `responsable`, tests, documentation, spécifications 001 et 003). |
| Création d'une garde | Aujourd'hui réservée aux gestionnaires ; elle devra aussi pouvoir naître d'une demande d'enseignant ou d'un signalement de surveillant (Q2). |
| Mode d'attribution | Aujourd'hui, diffusion à un groupe et **prise par le premier volontaire** ; cette diffusion est supprimée : seul l'admin assigne, sauf déclaration de classe vide attribuée au déclarant (Q2). La réassignation existante est conservée, mais seule l'admin peut la déclencher. Les tests existants des gardes sont adaptés. |
| Groupes et profil | Créer ou réutiliser les groupes « Enseignants » et « Surveillants » (le groupe actuel est « Surveillants/Remplaçants ») ; ajouter l'étage au profil du surveillant (Q3). |
| Statuts | Six statuts principaux (en attente, assignée, en cours, terminée, annulée, non pourvue) remplacent les dix statuts des gardes ; certains états actuels deviennent des sous-états affichés en badge (Q4). |
| Enseignant absent | Aujourd'hui un nom en texte libre ; doit devenir un employé identifié, membre du groupe « Enseignants » (qui signale, qui arrive, statistiques par enseignant). |
| Disponibilité | Calculée sur les gardes qui se chevauchent ; la notion de « créneau » et la prise en compte du tour d'étage restent à préciser (Q5, Q8). |
| Notifications | Cibles à revoir : « l'admin » à la place des responsables de catégorie ; nouveaux événements (signalement enseignant, classe vide). |

### Ce qui manque

- Un moyen pour l'enseignant de **signaler à l'avance** un retard ou une absence (aujourd'hui ou
  demain) et d'en suivre le traitement.
- Un moyen pour le surveillant de **déclarer une classe vide** pendant son tour et de clôturer
  l'incident à l'arrivée de l'enseignant.
- La notion d'**étage** : étages, rattachement des classes à un étage, rattachement de 1 ou 2
  surveillants à un étage.
- La saisie d'une **plage horaire** (date, début, fin ou durée) sur un signalement ; aucun
  emploi du temps n'est créé (reporté à un lot ultérieur).
- L'**identification de l'enseignant** concerné (membre du groupe « Enseignants ») ; pas de lien
  enseignant ↔ classes pour l'instant.
- La **source** d'une affectation (demande enseignant, signalement surveillant, création directe).
- La distinction **retard / absence** et le **motif** facultatif.
- Des **statistiques sur les retards et absences** (Q15).

## Questions à clarifier

Toutes les questions sont tranchées ; cette section est conservée pour la traçabilité.

### Rôles et renommage

- **Q1 — Sens du renommage** : *tranchée (voir Clarifications).*
- **Q2 — Rapport avec les « Gardes » existantes** : *tranchée (voir Clarifications).*
- **Q3 — Enseignant et surveillant** : *tranchée (voir Clarifications).*

### Données de référence

- **Q4 — Statuts** : *tranchée (voir Clarifications).*
- **Q5 — Créneau** : *tranchée (voir Clarifications)*.
- **Q6 — Classes de l'enseignant** : *tranchée (toutes les classes, voir Clarifications)*.
- **Q7 — Étages** : *tranchée (voir Clarifications)*.

### Règles des parcours

- **Q8 — Disponibilité** : *tranchée (voir Clarifications)*.
- **Q9 — Signalement de classe vide (source 2)** : l'affectation est créée au nom du déclarant
  et démarre « en cours », et l'admin peut la réassigner ; l'enseignant est facultatif, choisi
  dans le groupe « Enseignants », sans pré-remplissage tant qu'aucun emploi du temps n'existe
  (Clarifications). *Tranchée.*
- **Q10 — Fin d'une affectation** : *tranchée (voir Clarifications)*.
- **Q11 — Délai de signalement** : *tranchée (voir Clarifications)*.
- **Q12 — Annulation et modification** : *tranchée (voir Clarifications)*.
- **Q13 — Doublons** : *tranchée (voir Clarifications)*.

### Notifications, historique, statistiques

- **Q14 — Notifications** : *tranchée (voir Clarifications)*.
- **Q15 — Statistiques** : *tranchée (voir Clarifications)*.
- **Q16 — Conservation et confidentialité (RGPD)** : *tranchée (voir Clarifications)*.
- **Q17 — Durée** : *tranchée (voir Clarifications)*.

### Compatibilité

- **Q18 — Accès des autres employés** : *tranchée (voir Clarifications)*.
- **Q19 — Tour d'étage** : *tranchée (hors périmètre, voir Clarifications)*.
- **Q20 — Supports** : *tranchée (voir Clarifications)*.
- **Q21 — Surveillant déjà affecté qui trouve une classe vide** : *tranchée (voir Clarifications)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Signaler à l'avance un retard ou une absence (Priority: P1)

Une enseignante sait qu'elle arrivera en retard demain matin. Depuis l'application, elle signale
un retard pour demain, en précisant le créneau, la classe et, si elle le souhaite, un motif. Elle
voit son signalement « en attente ». L'admin est notifiée, consulte les surveillants disponibles
sur ce créneau et en assigne un. Le surveillant est notifié de son affectation (classe, créneau) ;
le signalement passe « assignée ». Le jour venu, le surveillant prend la classe (« en cours »),
puis clôture à l'arrivée de l'enseignante (« terminée »).

**Why this priority**: c'est le parcours nouveau de plus forte valeur : il permet d'anticiper et
d'éviter qu'une classe reste sans adulte. Il pose les briques réutilisées par les autres parcours
(affectation, disponibilité, statuts, notifications).

**Independent Test**: un compte enseignant signale un retard pour le lendemain ; un compte admin
voit le signalement et assigne un surveillant disponible ; le compte surveillant voit son
affectation ; la clôture enregistre l'historique. Testable sans les stories 2 et 3.

**Acceptance Scenarios**:

1. **Given** un enseignant connecté, **When** il signale un retard pour aujourd'hui ou demain avec
   date, créneau et classe (motif vide), **Then** le signalement est enregistré « en attente »,
   horodaté, avec la source « demande enseignant », et l'admin est notifiée en temps réel.
2. **Given** un signalement sans date, créneau ou classe, **When** l'enseignant tente de
   l'envoyer, **Then** l'envoi est bloqué et chaque champ manquant est signalé clairement.
3. **Given** une date autre qu'aujourd'hui ou demain, **When** l'enseignant tente de l'envoyer,
   **Then** l'envoi est refusé avec un message expliquant la règle (FR-012).
4. **Given** un signalement « en attente », **When** l'admin ouvre la liste des surveillants
   disponibles pour ce créneau, **Then** aucun surveillant déjà affecté sur un créneau qui
   chevauche n'y figure.
5. **Given** un signalement « en attente », **When** l'admin assigne un surveillant disponible,
   **Then** le statut passe « assignée », le surveillant est notifié de la classe et du créneau,
   et l'action est tracée (qui, quand).
6. **Given** une affectation « assignée », **When** le surveillant prend la classe puis la clôture
   à l'arrivée de l'enseignant, **Then** les statuts passent « en cours » puis « terminée », et
   l'historique conserve qui, quand, quelle classe et la durée (durée : FR-021).
7. **Given** un enseignant ou un surveillant, **When** il tente d'assigner un surveillant,
   **Then** l'action est refusée et le refus est journalisé.

---

### User Story 2 - Déclarer une classe vide pendant le tour (Priority: P1)

Pendant son tour d'étage, un surveillant trouve une classe sans enseignant. Il la déclare dans
l'application (classe, et créneau courant), reste avec les élèves, et l'admin en est informée
immédiatement. Quand l'enseignant arrive, le surveillant clôture l'incident et reprend son tour.

**Why this priority**: c'est la situation la plus fréquente et la plus urgente (élèves sans
adulte) ; elle ne dépend pas d'un signalement préalable de l'enseignant.

**Independent Test**: un compte surveillant déclare une classe vide ; le compte admin reçoit
l'information en temps réel ; le surveillant clôture ; l'historique est complet. Testable sans les
stories 1 et 3.

**Acceptance Scenarios**:

1. **Given** un surveillant connecté, **When** il déclare une classe vide, **Then** une
   affectation est créée à son nom, sans intervention de l'admin, avec la source « signalement
   surveillant », horodatée, et l'admin est notifiée en temps réel ; l'affectation démarre directement « en cours ».
2. **Given** un incident ouvert par un surveillant, **When** l'enseignant arrive et que le
   surveillant clôture l'incident, **Then** le statut passe « terminée », l'heure de clôture est
   enregistrée et le surveillant redevient disponible.
3. **Given** un surveillant déjà affecté à une autre classe sur ce créneau, **When** il déclare une
   classe vide, **Then** l'affectation est créée quand même à son nom, « en cours », et l'admin
   reçoit immédiatement une alerte mise en évidence pour réassigner l'une des deux affectations
   (FR-015j).
4. **Given** une classe déjà couverte par une affectation en cours sur ce créneau, **When** un
   surveillant la déclare vide, **Then** la déclaration est rattachée à l'affectation existante, sans en créer une seconde, et l'admin est informée (FR-015f).

---

### User Story 3 - Créer une affectation directe (Priority: P2)

Un enseignant appelle l'administration pour prévenir de son absence. L'admin crée elle-même
l'affectation (classe, créneau, surveillant disponible), sans demande préalable dans
l'application. Le surveillant est notifié.

**Why this priority**: elle couvre les cas hors application ; l'existant permet déjà en partie de
créer une garde, ce qui réduit l'effort.

**Independent Test**: un compte admin crée une affectation directe ; le surveillant choisi la
reçoit ; elle apparaît dans l'historique avec la source « création directe ».

**Acceptance Scenarios**:

1. **Given** l'admin connectée, **When** elle crée une affectation en choisissant classe, créneau
   et un surveillant disponible, **Then** l'affectation est créée « assignée » avec la source
   « création directe », et le surveillant est notifié.
2. **Given** un surveillant déjà affecté sur un créneau qui chevauche, **When** l'admin crée une
   affectation, **Then** ce surveillant ne lui est pas proposé.
3. **Given** un enseignant ou un surveillant, **When** il tente de créer une affectation directe,
   **Then** l'action est refusée et le refus est journalisé.

---

### User Story 4 - Rôle « admin » à la place de « responsable » (Priority: P1)

Partout où l'application affiche, contrôle ou documente le rôle « responsable », elle utilise
désormais « admin », sans qu'aucun utilisateur actuel ne perde un accès ou une donnée.

**Why this priority**: les trois parcours s'adressent à « l'admin » ; le renommage conditionne
les droits et les textes de toute la fonctionnalité.

**Independent Test**: après la mise à jour, un utilisateur auparavant « responsable » se connecte,
voit le libellé « admin » et retrouve tous ses accès et ses demandes ; aucun texte de l'interface
n'emploie plus « responsable » au sens du rôle.

**Acceptance Scenarios**:

1. **Given** un compte « responsable » existant, **When** la mise à jour est appliquée, **Then**
   il devient « admin » et conserve ses demandes, ses catégories et son historique.
2. **Given** n'importe quel écran ou message, **When** il désigne ce rôle, **Then** il emploie
   « Admin », et le rôle « Super administrateur » reste distinct et inchangé dans ses droits.
3. **Given** un admin (ex-responsable), **When** il utilise les demandes de travail, **Then** il
   dispose des droits que le mode de routage donne à l'administration (Q22) : via
   l'administration, validation, affectation, réaffectation, priorité et discussion dans les
   catégories qu'il gère ; direct et entre enseignants, consultation en lecture seule de toutes
   les demandes, sans notification ; création possible dans toute catégorie active.
4. **Given** les parcours existants (demandes de travail selon leur mode de routage, gardes,
   administration), **When** ils sont rejoués après la mise à jour, **Then** ils se comportent
   comme dans `master` après la PR #9 (Q24), hormis le changement voulu d'attribution des gardes
   (FR-011a).

---

### User Story 5 - Consulter l'historique et les statistiques (Priority: P3)

L'admin consulte l'historique des affectations (qui, quand, quelle classe, durée, source) et des
statistiques sur les retards et absences.

**Why this priority**: utile au pilotage, mais non nécessaire pour couvrir les classes au jour le
jour.

**Independent Test**: après plusieurs affectations terminées, l'admin filtre l'historique et
obtient des chiffres cohérents avec les données saisies.

**Acceptance Scenarios**:

1. **Given** des affectations terminées et annulées, **When** l'admin consulte l'historique,
   **Then** elle voit pour chacune l'enseignant concerné, la classe, le créneau, le surveillant,
   la source, les statuts successifs avec leurs auteurs et heures, et la durée.
2. **Given** l'historique, **When** l'admin consulte les statistiques, **Then** elle obtient les
   indicateurs définis en FR-022, les annulées et doublons « non tranchés » à part.

---

### Edge Cases

- Aucun surveillant disponible sur le créneau : la demande reste « en attente », alerte et escalade (FR-011d, FR-011e), puis « non pourvue » (FR-008a).
- Signalement pour une plage déjà commencée (accepté, délai immédiat : FR-011d) ou entièrement passée (refusé : FR-012).
- Enseignant qui signale puis arrive finalement à l'heure : il retire sa demande si elle est « en attente » (FR-008g), sinon l'admin l'annule (FR-008e).
- Même classe signalée par l'enseignant et déclarée vide par un surveillant (FR-015d à FR-015h).
- Surveillant affecté qui devient indisponible ou absent après l'assignation.
- Surveillant qui oublie de clôturer l'affectation : rappel au surveillant puis à l'admin (FR-016a).
- Affectation « en attente » jamais assignée : « non pourvue » une fois le créneau passé (FR-008a).
- Perte de connexion au moment d'envoyer un signalement ou une déclaration (l'existant conserve
  la saisie et permet de relancer pour les demandes de travail).
- Classe désactivée ou surveillant désactivé alors qu'une affectation est en cours.
- Changement de rôle d'un utilisateur alors qu'il a des affectations en cours.

## Requirements *(mandatory)*

### Functional Requirements

#### Continuité

- **FR-001**: Le système DOIT réutiliser les classes, groupes, disponibilités, notifications en
  temps réel, historique non modifiable et journal d'audit existants au lieu d'en créer de
  nouveaux équivalents.
- **FR-002**: Toutes les fonctionnalités existantes (demandes de travail vocales et leurs modes de
  routage — via l'administration, direct, entre enseignants —, lecture seule des demandes
  terminées, messagerie, délais, notifications du super administrateur, gardes, administration)
  DOIVENT continuer à fonctionner ; la suite de tests de `master` après la PR #9 (Q24) DOIT rester
  au vert, adaptée seulement pour le renommage du rôle et pour la suppression de la diffusion des
  gardes (FR-011a).
- **FR-003**: La mise à jour DOIT conserver toutes les données existantes (comptes, demandes,
  gardes, historiques).

#### Rôles

- **FR-004**: Le rôle « Responsable » DOIT être renommé « Admin » dans les données, les droits,
  l'interface, les messages et la documentation, en conservant exactement ses droits actuels ; le
  rôle « Super administrateur » DOIT rester distinct ; dans l'interface, « Admin » NE DOIT
  jamais désigner le propriétaire.
- **FR-004a**: L'espace « Administration » DOIT être renommé « Administrateur » ; le rôle du
  propriétaire DOIT s'afficher « Super administrateur ».
- **FR-004b**: Le super administrateur DOIT pouvoir agir dans tous les rôles de ces parcours
  (Admin, Surveillant, Enseignant).
- **FR-004c**: Le compte de démonstration `responsable` DOIT être renommé `admin` (identifiant,
  nom affiché, données d'initialisation et comptes de test associés).
- **FR-004d**: Les spécifications 001 et 003 NE DOIVENT PAS être réécrites ; une note y
  indique que « Responsable » est devenu « Admin » et que la terminologie de la spécification
  courante fait foi.
- **FR-005**: Les enseignants et les surveillants DOIVENT rester des employés, identifiés par
  leur appartenance aux groupes « Enseignants » et « Surveillants » (groupes existants
  réutilisés) ; un employé PEUT appartenir aux deux groupes.
- **FR-005a**: Le groupe existant « Surveillants/Remplaçants » DOIT être renommé « Surveillants »
  en conservant ses membres ; avant la migration, la liste des membres qui ne sont pas
  surveillants DOIT être présentée pour décision.
- **FR-006**: Chaque classe DOIT appartenir à un étage, et chaque surveillant DOIT pouvoir être
  rattaché à un seul étage par un champ de son profil. Seul le super administrateur DOIT pouvoir
  créer les étages et y rattacher les classes ; l'admin NE DOIT PAS modifier cette structure.
- **FR-006a**: Un étage sans surveillant DOIT donner lieu à un simple avertissement, sans
  blocage ; aucune limite haute n'est imposée au nombre de surveillants par étage.

#### Affectations

- **FR-007**: Une affectation DOIT enregistrer sa source parmi : demande enseignant, signalement
  surveillant, création directe par l'admin.
- **FR-008**: Une affectation DOIT porter un des six statuts principaux : en attente, assignée,
  en cours, terminée, annulée, non pourvue ; seules des transitions définies sont permises.
- **FR-008a**: « Terminée », « annulée » et « non pourvue » DOIVENT être des statuts finaux.
  « Non pourvue » DOIT être posé automatiquement quand le créneau est passé sans qu'aucun
  surveillant n'ait été assigné. L'annulation PEUT porter un motif facultatif. « Annulée » et
  « non pourvue » DOIVENT être comptées séparément dans l'historique et les statistiques.
- **FR-008b**: Sur une demande « en attente », l'admin (ou le super administrateur) DOIT pouvoir
  assigner un surveillant ou annuler la demande (motif facultatif, statut « annulée »).
- **FR-008g**: L'enseignant demandeur DOIT pouvoir retirer sa propre demande tant qu'elle est
  « en attente » (statut « annulée », motif facultatif), et la modifier (date, créneau, classe,
  motif) dans les mêmes conditions ; chaque modification DOIT être tracée dans l'historique.
  Une fois la demande assignée, il NE DOIT PLUS pouvoir la modifier ni la retirer.
- **FR-008h**: Une affectation « en cours » NE DOIT pouvoir être annulée que par l'admin (ou le
  super administrateur), motif facultatif (ex. classe vide déclarée par erreur).
- **FR-008i**: Les affectations annulées NE DOIVENT PAS être comptées comme des retards ou
  absences réels dans les statistiques ; elles DOIVENT être comptées à part.
- **FR-008e**: Sur une affectation « assignée », l'admin (ou le super administrateur) PEUT
  l'annuler (motif facultatif) ou la réassigner à un autre surveillant disponible ; seule l'admin
  décide. En cas d'annulation ou de réassignation, l'ancien surveillant DOIT être notifié que son
  affectation est levée ; en cas de réassignation, le nouveau DOIT recevoir l'ordre et le statut
  DOIT rester « assignée ».
- **FR-008j**: Sur une affectation « en cours », l'admin (ou le super administrateur) PEUT la
  réassigner à un autre surveillant disponible ; le statut DOIT rester « en cours » et le nouveau
  surveillant DOIT être notifié. Le surveillant d'origine NE DOIT être libéré qu'une fois la
  présence du nouveau confirmée par le mécanisme de relève existant.
- **FR-008k**: Toute réassignation DOIT être tracée (auteur, date et heure, ancien et nouveau
  surveillant).
- **FR-008f**: Le surveillant assigné NE DOIT PAS pouvoir accepter, refuser ni annuler une
  affectation ; il DOIT seulement pouvoir en mettre à jour l'avancement (« en cours », puis
  « terminée »).
- **FR-008c**: Une affectation PEUT porter un sous-état, affiché en badge, qui ne modifie pas son
  statut principal : « En route » et « En retard » sous « assignée » ; « Relève demandée » sous
  « en cours » ; « Clôturée après validation » sous « terminée ». Filtres, statistiques et alertes
  DOIVENT se fonder sur le statut principal.
- **FR-008d**: À la mise à jour, les gardes terminées existantes DOIVENT être rattachées au statut
  principal équivalent (« terminée »), leur ancien libellé conservé comme sous-état ; aucune
  donnée d'historique NE DOIT être supprimée ni réécrite. Un contrôle préalable DOIT lister tout
  ancien statut sans équivalent évident et le soumettre pour décision avant la migration.
- **FR-009**: Seul l'admin DOIT pouvoir assigner un surveillant à une affectation et créer une
  affectation directe ; ces droits DOIVENT être vérifiés côté serveur et tout refus journalisé.
  Seule exception : la déclaration de classe vide par un surveillant crée l'affectation à son nom
  (FR-015).
- **FR-010**: Le système DOIT proposer à l'admin uniquement les surveillants disponibles : un
  surveillant ayant une affectation active (assignée ou en cours, renfort compris) dont la plage
  chevauche la plage demandée NE DOIT PAS être proposé. La liste DOIT présenter d'abord les
  surveillants de l'étage de la classe, puis les autres ; l'admin PEUT assigner un surveillant
  d'un autre étage. Un surveillant dont la disponibilité déclarée est « Indisponible » ou
  « Absent » NE DOIT PAS être proposé.
- **FR-011**: Une affectation DOIT être une garde existante enrichie de sa source, de l'étage
  et de l'enseignant concerné.
- **FR-011a**: La diffusion d'une garde à un groupe avec prise par le premier volontaire DOIT
  être supprimée ; le surveillant DOIT être notifié lorsque l'admin l'assigne. Les tests
  existants des gardes DOIVENT être adaptés à ce changement.
- **FR-011b**: La confirmation de présence par QR code ou photo, la prolongation, la relève et
  les délais DOIVENT fonctionner sur les affectations comme aujourd'hui sur les gardes ; seule
  l'attribution change (une relève est donc assignée par l'admin, et non plus diffusée).
- **FR-011d**: Le délai de prise en charge (2 minutes par défaut, réglable) DOIT mesurer le temps
  laissé à l'admin pour assigner un surveillant. Il DOIT démarrer dès la création si le créneau a
  commencé ou débute dans moins de 60 minutes (seuil réglable), et sinon au moment où le début du
  créneau passe sous ce seuil. Il NE DOIT PAS s'appliquer à une classe vide déclarée par un
  surveillant.
- **FR-011e**: À l'expiration du délai, une alerte DOIT être envoyée à l'admin ; si aucune
  réponse n'intervient dans les 5 minutes (durée réglable), l'alerte DOIT être escaladée au super
  administrateur. L'escalade DOIT s'arrêter dès que la demande est assignée ou annulée (par
  l'admin, ou retirée par l'enseignant) ; la consultation de l'alerte NE DOIT PAS l'arrêter. La demande DOIT rester « en attente » et être affichée en priorité.
- **FR-011f**: Pour une demande portant sur une date ultérieure, un rappel DOIT être envoyé à
  7 h 00 (heure réglable) le jour de la date concernée, à l'admin uniquement, si la demande est
  encore « en attente » à cette heure.
- **FR-011c**: À la mise à jour, les gardes encore ouvertes (en diffusion) DOIVENT être
  conservées et présentées à l'admin « en attente » ; les gardes déjà prises par un volontaire
  DOIVENT rester inchangées. Les gardes « Non pourvues » dont le créneau n'est pas passé DOIVENT
  repasser « en attente » ; celles dont le créneau est passé DOIVENT rester « non pourvues » dans
  l'historique et être comptées dans les statistiques.

#### Parcours enseignant

- **FR-012**: Un enseignant DOIT pouvoir signaler un retard ou une absence pour aujourd'hui ou
  demain uniquement, jamais pour une plage déjà entièrement passée, sans délai minimum, en
  indiquant la date, l'heure de début, l'heure de fin (ou une durée), la classe —
  choisie parmi toutes les classes de l'école — et, facultativement, un motif (heure d'arrivée
  prévue : aucune, la fin est la clôture par le surveillant — FR-016). Une demande DOIT porter sur une seule classe et une seule plage horaire ; une
  absence sur plusieurs plages ou classes donne lieu à plusieurs demandes.
- **FR-012a**: Le modèle DOIT permettre de regrouper plus tard plusieurs demandes sous une même
  absence sans refonte (gestion des absences reportée).
- **FR-013**: Le signalement DOIT créer une affectation « en attente » de source « demande
  enseignant » et notifier l'admin en temps réel.
- **FR-014**: L'enseignant DOIT pouvoir consulter ses signalements et leur statut, et les modifier ou les retirer dans les conditions de FR-008g.

#### Parcours surveillant

- **FR-015**: Un surveillant DOIT pouvoir déclarer une classe vide ; la déclaration crée
  directement une affectation à son nom, de source « signalement surveillant », sans assignation
  par l'admin ; elle démarre directement « en cours » et l'admin est informée en temps réel.
- **FR-015a**: L'indication de l'enseignant concerné DOIT être facultative, vide par défaut, et
  NE DOIT JAMAIS bloquer la déclaration ; le surveillant PEUT choisir un membre du groupe
  « Enseignants » ou laisser le champ vide. Aucun pré-remplissage dans cette fonctionnalité ; la
  conception du champ DOIT permettre d'ajouter un pré-remplissage depuis un futur emploi du
  temps sans refonte.
- **FR-015b**: Une affectation sans enseignant renseigné DOIT être comptée dans les statistiques
  comme « classe sans enseignant, enseignant non précisé ».
- **FR-015c**: L'admin (ou le super administrateur) DOIT pouvoir compléter ou corriger
  l'enseignant d'une affectation après coup ; chaque correction DOIT être tracée.
- **FR-015d**: Si l'enseignant identifié a déjà une demande pour la même classe sur une plage
  horaire qui chevauche, la déclaration DOIT être rattachée à cette demande au lieu de créer un
  doublon. Si la demande est « en attente », elle DOIT passer « en cours » avec le surveillant
  déclarant.
- **FR-015e**: Si la demande correspondante est déjà « assignée » à un autre surveillant, elle
  NE DOIT PAS être modifiée automatiquement : le surveillant assigné reste responsable, le
  déclarant DOIT être informé de qui est assigné, et l'admin DOIT être notifiée pour décider
  (réassigner ou laisser).
- **FR-015f**: Si une affectation « en cours » existe déjà pour la même classe sur une plage qui
  chevauche (qu'elle vienne d'une demande ou d'une autre déclaration), la déclaration DOIT y être
  rattachée sans créer de nouvelle affectation ; le surveillant déjà présent reste responsable ;
  le déclarant DOIT être informé que la classe est prise en charge, et l'admin DOIT être
  informée et décider si le second surveillant reste en renfort ou reprend sa tournée.
- **FR-015g**: Si la déclaration ne précise pas l'enseignant et qu'une demande existe pour la
  même classe sur une plage qui chevauche, le rattachement NE DOIT PAS être automatique :
  l'application DOIT le proposer à l'admin, qui confirme ou refuse ; tant qu'il n'est pas
  confirmé, l'affectation du surveillant reste distincte. Toute décision (confirmation ou refus)
  DOIT être tracée.
- **FR-015h**: Tant qu'une proposition de rattachement est en suspens, les deux affectations
  DOIVENT être marquées « doublon possible » et comptées une seule fois dans les statistiques ;
  à la décision, elles DOIVENT compter pour un événement (rattachement confirmé) ou deux
  (refusé). La proposition DOIT rester visible chez l'admin jusqu'à décision et lui être
  présentée une dernière fois si les deux affectations sont terminées sans décision. Sans
  décision ensuite, elles DOIVENT rester comptées une seule fois avec la mention « non tranché »,
  et les statistiques DOIVENT distinguer ces doublons « non tranchés » des chiffres définitifs.
  L'admin (ou le super administrateur) DOIT pouvoir décider à tout moment, y compris après
  coup ; le décompte DOIT alors être corrigé et la correction tracée.
- **FR-015i**: Un surveillant en renfort DOIT être considéré occupé (non proposé pour une autre
  affectation) tant qu'il est dans la classe ; il DOIT redevenir disponible quand l'admin le
  libère ou quand l'affectation passe « terminée ». Sans décision de l'admin sur ce renfort, un
  rappel DOIT lui être envoyé toutes les 10 minutes (durée réglable), dans la limite de 3 rappels
  (plafond réglable) ; après le dernier, l'alerte DOIT être transmise au super administrateur.
- **FR-015j**: Un surveillant déjà occupé qui déclare une classe vide DOIT quand même recevoir
  l'affectation à son nom, « en cours » ; c'est le seul cas où deux affectations actives d'un
  même surveillant peuvent se chevaucher. L'admin DOIT recevoir immédiatement une alerte mise en
  évidence et PEUT réassigner l'une ou l'autre des deux affectations ; tout DOIT être tracé.
- **FR-016**: Une affectation DOIT se terminer quand le surveillant la passe « terminée » (à
  l'arrivée de l'enseignant) ; l'heure de clôture est enregistrée et il redevient disponible.
- **FR-016a**: Une affectation assignée ou en cours dont le créneau est fini sans clôture DOIT
  déclencher un rappel au surveillant 10 minutes après la fin du créneau (réglable), puis un
  rappel à l'admin après 10 minutes supplémentaires sans réponse (réglable). Pour une garde
  antérieure sans heure de fin (« jusqu'à l'arrivée »), la fin du créneau est réputée être la fin
  de la journée locale : aucun rappel de clôture NE DOIT partir avant.
- **FR-017**: Le surveillant DOIT être notifié de toute affectation qui lui est assignée (classe,
  créneau) et pouvoir consulter ses affectations.
- **FR-017a**: L'enseignant auteur d'une demande DOIT être notifié dans l'application quand un
  surveillant est assigné à sa demande, ou réassigné ; la notification indique la classe, le
  créneau et le nom du surveillant, sans autre détail.

#### Parcours admin

- **FR-018**: L'admin DOIT voir en temps réel les affectations en attente, assignées et en cours.
- **FR-019**: L'admin DOIT pouvoir créer une affectation directe (classe, créneau, surveillant
  disponible), qui naît « assignée » avec la source « création directe ».

#### Historique et statistiques

- **FR-020**: Chaque création, assignation, changement de statut et clôture DOIT être tracé de
  façon non modifiable (auteur, date et heure, valeurs avant/après).
- **FR-021**: L'historique DOIT conserver pour chaque affectation l'enseignant concerné, la
  classe, le créneau, le surveillant, la source, les horodatages et la durée, mesurée du passage
  « en cours » jusqu'à « terminée » (pour une classe vide déclarée, à partir de la déclaration).
- **FR-022**: L'admin et le super administrateur DOIVENT pouvoir consulter l'historique et les
  statistiques : nombre de retards par enseignant, par classe, par période, durée moyenne, taux
  de « non pourvue » ; les « annulées » et les doublons « non tranchés » DOIVENT être comptés à
  part. Aucun export dans ce lot.
- **FR-023**: Les statistiques et historiques par enseignant DOIVENT être réservés à l'admin et au
  super administrateur ; un enseignant NE DOIT voir que ses propres demandes.
- **FR-023a**: Au bout d'une année scolaire (durée réglable, à valider avec la direction),
  l'enseignant et le motif DOIVENT être anonymisés dans les données du module ; les événements
  (date, classe, durée, statut) DOIVENT être conservés pour les statistiques globales. Le journal
  d'audit DOIT être exclu de cette anonymisation et rester non modifiable.
- **FR-023c**: Le surveillant affecté DOIT voir la classe, l'étage, le créneau et le type de
  signalement (retard, absence, classe vide), mais NE DOIT JAMAIS voir le motif détaillé saisi
  par l'enseignant, réservé à l'admin et au super administrateur.
- **FR-007a**: Chaque affectation DOIT porter un type : retard, absence ou classe vide. Il est
  choisi par l'enseignant pour sa demande, par l'admin pour une affectation directe, et vaut
  « classe vide » pour une déclaration de surveillant.
- **FR-023b**: Le module NE DOIT être accessible qu'à l'admin, au super administrateur, au
  surveillant (ses affectations) et à l'enseignant (ses demandes) ; les autres employés n'en
  voient rien. Tous les admins y ont accès, sans restriction par catégorie de garde.

#### Notifications

- **FR-024**: Tous les événements du module DOIVENT être notifiés dans l'application, via le
  mécanisme existant en temps réel. Aucun canal externe (e-mail, SMS, push) n'est ajouté ; il
  n'en existe aucun aujourd'hui.
- **FR-024a**: Les cas urgents (classe vide déclarée, expiration du délai de prise en charge,
  escalade, surveillant avec deux affectations actives) DOIVENT faire l'objet d'une alerte mise en évidence, visuelle et, le cas échéant,
  sonore ; l'information NE DOIT jamais reposer sur le seul son.

#### Supports

- **FR-025**: Les changements DOIVENT s'appliquer à l'application web existante, sur tous les
  formats qu'elle sert déjà (smartphone, tablette, ordinateur) ; aucun nouveau support n'est
  créé.

### Key Entities *(include if feature involves data)*

- **Admin** : rôle « Responsable » renommé, mêmes droits (demandes de travail : selon le mode de
  routage de la catégorie, Q22) ; supervise, reçoit les informations,
  assigne. Distinct du « Super administrateur », qui peut néanmoins jouer tous les rôles de ces
  parcours.
- **Enseignant** : employé membre du groupe « Enseignants » ; signale un retard ou une absence ;
  classes qu'il peut déclarer : Q6.
- **Surveillant** : employé membre du groupe « Surveillants », dont le profil porte un seul étage
  de rattachement ; affectable aux classes de tout étage.
- **Étage** : regroupe plusieurs classes ; 1 ou 2 surveillants rattachés.
- **Classe** : existante ; reçoit un rattachement à un étage.
- **Créneau** : plage horaire libre (date, heure de début, heure de fin) sur laquelle porte une
  affectation et sur laquelle est calculée la disponibilité ; pas de grille fixe.
- **Affectation** : garde d'une classe sur un créneau par un surveillant ; source, type (retard /
  absence / classe vide), motif facultatif, statut, horodatages, durée ; c'est la garde existante
  enrichie.
- **Historique d'affectation** : suite non modifiable des événements d'une affectation (existant).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un enseignant envoie un signalement de retard ou d'absence en moins de 1 minute.
- **SC-002**: Un surveillant déclare une classe vide en moins de 30 secondes depuis un smartphone.
- **SC-003**: L'admin est informée d'un signalement ou d'une déclaration en moins de 5 secondes
  lorsqu'elle est connectée.
- **SC-004**: L'admin assigne un surveillant disponible en moins de 1 minute après réception du
  signalement.
- **SC-005**: 100 % des surveillants proposés à l'admin sont libres sur le créneau (aucun conflit
  dans les tests d'acceptation).
- **SC-006**: 100 % des affectations terminées ou annulées figurent dans l'historique avec auteur,
  classe, créneau, source et durée.
- **SC-007**: Après la mise à jour, aucun texte d'interface n'emploie « responsable » au sens du
  rôle, et 100 % des parcours existants rejoués passent.
- **SC-008**: Aucune action d'assignation ou de création d'affectation n'aboutit pour un compte
  autre qu'admin (tests de refus côté serveur).

## Assumptions

Seuls des faits constatés, des contraintes de la constitution ou des choix confirmés (voir
« Clarifications ») figurent ici.

- Les règles de la constitution s'appliquent : tests écrits en premier, statuts finis à
  transitions définies, journal d'audit non modifiable, contrôle des droits côté serveur,
  accessibilité WCAG 2.2 AA, minimisation des données personnelles.
- Les comptes existent déjà et l'authentification actuelle est réutilisée.
- Le mécanisme de notifications en temps réel existant est réutilisé (FR-024).
- Hors périmètre (confirmé) : emploi du temps et lien enseignant ↔ classes, reportés à un lot
  ultérieur.
- Hors périmètre (confirmé) : gestion des absences (journée entière, multi-classes, absences
  longues), reportée à un lot ultérieur.
- Hors périmètre (confirmé) : suivi de tournée d'étage (aucun parcours, pointage ni suivi de
  tournée).
- Hors périmètre (confirmé) : gestion des congés et absences des surveillants ; export des
  statistiques ; canaux de notification externes (e-mail, SMS, push).
- Hors périmètre : remplacement pédagogique (cours assuré par un autre enseignant), paie ou
  décompte des heures, intégration avec un logiciel de vie scolaire externe.
