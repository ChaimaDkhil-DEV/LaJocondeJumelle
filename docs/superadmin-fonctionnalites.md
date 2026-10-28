# Fonctionnalités du super administrateur — inventaire

> Établi le 2026-10-16 à partir de `258df07`, mis à jour le 2026-10-21 à partir du code de `master`
> (`186f7f2`, après la fonctionnalité 004, PR #18). Les références `fichier:ligne` pointent vers ce
> commit. « Serveur » = contrôle effectué par l'API, indépendamment de l'interface. Aucun fichier de
> l'application n'a été modifié pour cet inventaire. Bloc profil et « Mon profil » (§1.1, §4) mis à
> jour pour la spec 005 (2026-10-22) ; les références `AppLayout.tsx` pointent vers ce code.
> Modification d'une affectation par l'admin (§2.7, §3, §4.2) mise à jour pour la spec 006.
> Export des statistiques des affectations (§2.2, §2.7, §4.3) mis à jour pour la spec 008.
>
> Depuis la 004 : le rôle « Responsable » (`MANAGER`) est devenu « Admin » (`ADMIN`, migration
> 0009) ; la diffusion des gardes est remplacée par l'assignation d'un surveillant par un admin
> (§3). Voir `specs/004-retards-affectation-surveillants/`.

## Données de démonstration déjà présentes

Le seed de démonstration crée des catégories marquées « démo » : « Intervention technique (démo
circuit B) » et « Petits travaux (démo photo) ». Elles sont présentes dans la base de
développement, avec la garde « Garde de classe » renommée « Garde surveillance » et la catégorie de
travail « Surveillance » créées le 2026-10-16. Elles sont signalées ici et n'ont pas été supprimées.

Depuis la 004, le seed crée aussi les groupes à clé système « Surveillants » et « Enseignants »,
deux étages (« 1er étage », « 2e étage ») avec leurs classes et surveillants, et les comptes
`admin` (« Admin — surveillante générale »), `surveillant`, `remplacant`, `surveillant2`.

## 1. Menu latéral

### 1.1 Entrées du menu

Rôles : Employé (`EMPLOYEE`), Admin (`ADMIN`), Super administrateur (`SUPER_ADMIN`). Toutes les
routes de l'API exigent une session valide (garde globale `SessionGuard`,
`backend/src/auth/auth.module.ts:27`).

| Entrée | Route | Rôles autorisés | Actions disponibles (super administrateur) | État |
| --- | --- | --- | --- | --- |
| Cloche de notifications | panneau (pas de route) | tous | liste, badge du nombre de non lues, clic qui ouvre la demande et la marque lue, « Tout marquer comme lu » | Complète |
| Mes demandes | `/` (onglets `?onglet=`) | tous | onglets Reçues, Envoyées, Brouillons (s'il y en a), À valider, Suivi ; recherche ; filtres ; détail | Complète |
| Nouvelle demande | `/demandes/nouvelle`, `/demandes/:id/brouillon` | tous (selon les catégories) | création dans toute catégorie de demande de travail active ; enregistrement en brouillon, reprise, envoi et suppression d'un brouillon | Complète (brouillons : spec 007) |
| Gardes | `/gardes`, `/gardes/nouvelle`, `/gardes/signaler`, `/gardes/classe-vide`, `/gardes/statistiques`, `/gardes/:id`, `/gardes/presence` | admins, super administrateur, membres des groupes Surveillants ou Enseignants | onglets En attente, En cours, Doublons, Équipe, Terminées ; nouvelle affectation ; statistiques ; actions sur une affectation | Complète (voir §3) |
| Administrateur | `/admin/*` | super administrateur | 9 onglets (§2) | Complète |
| Bloc profil (« Mon profil ») | `/profil` | tous | nom et rôle, lien vers « Mon profil » : informations du compte en lecture seule, « Changer mon mot de passe » | Complète (spec 005) |
| Se déconnecter | `POST /api/auth/logout` | tous | fin de session | Complète |

Détail par entrée :

- **Cloche** — composant `frontend/src/features/notifications/NotificationCenter.tsx` ; API
  `GET /api/notifications` et `POST /api/notifications/read`
  (`backend/src/notifications/notifications.controller.ts:42` et `:75`), limitées aux
  notifications de l'utilisateur connecté. Filtrage du super administrateur côté serveur, à la
  création de chaque notification (`backend/src/notifications/super-admin-policy.ts:41`,
  appliqué dans `notifications.service.ts`) : sur une demande de travail dont il n'est ni
  demandeur ni destinataire, il ne reçoit que les alertes « Demande urgente », « Demande sans
  employé affecté » (délai bientôt dépassé, type `UNASSIGNED`) et « Demande en retard », une fois
  par demande et par type, plus les messages d'une demande urgente ou en retard ; rien sur une
  demande terminée, refusée ou annulée. Les alertes « sans employé affecté » et « en retard » sont
  posées par une tâche planifiée (`backend/src/scheduler/super-admin-alerts.job.ts`, toutes les
  15 s au plus). Les affectations ne sont pas filtrées ; le super administrateur reçoit aussi
  l'escalade d'une affectation urgente non assignée (réglage `coverageEscalationMinutes`, §2.6).
  Le panneau affiche la référence de la demande (`D-AAAA-NNNNNN`, `NotificationCenter.tsx:145`),
  masquée ailleurs (§4).
- **Mes demandes** — `frontend/src/features/requests/RequestListPage.tsx`, API
  `GET /api/requests?scope=` (`backend/src/requests/requests.controller.ts:36`). Visibilité du super
  administrateur : toutes les demandes de travail sauf les brouillons des autres
  (`backend/src/requests/domain/visibility.ts:19`).
  - « Reçues » (`scope=assigned`) : **seulement les demandes dont il est la personne affectée**,
    pas toutes les demandes.
  - « Envoyées » (`scope=mine`) : ses propres demandes, **sans** ses brouillons.
  - « Brouillons » (`scope=drafts`, spec 007) : ses propres brouillons ; l'onglet n'apparaît que
    s'il en existe au moins un. Un brouillon s'ouvre sur sa page de reprise.
  - « À valider » (admins et super administrateur, `RequestListPage.tsx:163`) : demandes en
    attente de validation administrative ou de validation finale, toutes catégories pour le super
    administrateur.
  - « Suivi » (admins et super administrateur, `scope=all`) : toutes les demandes visibles.
  - Recherche dans les titres ; filtres Statut, Priorité, Catégorie, Destinataire, Du/Au, « En
    retard uniquement » (`RequestFilters.tsx`), conservés dans l'URL.
  - Détail (`RequestDetailPage.tsx`, actions calculées par le serveur dans
    `backend/src/requests/domain/access-policy.ts`) : selon le mode de routage de la catégorie.
    Via l'administration : approuver ou refuser (motif), réaffecter, changer la priorité, valider
    ou renvoyer à corriger en validation finale, écrire dans la discussion. Direct et entre
    enseignants : **lecture seule** (aucune action, aucune écriture). Annuler : seulement sur ses
    propres demandes, avant acceptation. Discussion (texte, message vocal, photo, PDF) : si
    l'écriture est permise. Demande terminée : lecture seule, sans compte à rebours.
- **Nouvelle demande** — `frontend/src/features/requests/CreateRequestPage.tsx`, API
  `GET /api/categories` puis `POST /api/requests`. Catégories proposées au super administrateur :
  toutes les catégories **de demande de travail** actives, quels que soient leurs rôles autorisés
  (`access-policy.ts`, `canCreateInCategory`). Les catégories de garde n'y figurent jamais (les
  affectations se créent depuis Gardes). Champs : catégorie, destinataire (mode direct : service
  présélectionné s'il est seul ; entre enseignants : collègue à choisir ; via l'administration :
  aucun), priorité, titre, message vocal, description (l'un des deux suffit). Pas de pièce jointe
  à la création.
  - **Brouillons** (spec 007, si le réglage « Brouillons de demande autorisés » est actif) :
    « Enregistrer en brouillon » (catégorie et titre suffisent, priorité « Normale » par défaut) ;
    rien n'est envoyé ni notifié, le brouillon n'est visible que de son auteur. Reprise sur
    `/demandes/:id/brouillon` (`DraftPage.tsx`) : formulaire pré-rempli, message vocal à
    réécouter, remplacer ou supprimer ; « Enregistrer le brouillon » (`PATCH /api/requests/:id`),
    « Envoyer la demande » (action `SUBMIT`, mêmes règles qu'une création directe),
    « Supprimer le brouillon » après confirmation (`DELETE /api/requests/:id`). Réglage désactivé :
    plus de nouveau brouillon, les brouillons existants restent utilisables.
- **Gardes** — `frontend/src/features/coverage/CoveragePage.tsx` ; API `/api/coverage/*`
  (`backend/src/coverage/coverage.controller.ts`). Affichage du menu pour les admins, le super
  administrateur et les membres des groupes Surveillants ou Enseignants (`AppLayout.tsx:55`).
  Onglets selon le profil : admins et super administrateur (`isCoverageAdmin`,
  `backend/src/coverage/domain/coverage-policy.ts:56`) : En attente, En cours, Doublons, Équipe,
  Terminées ; enseignant : Mes signalements ; surveillant : Mes affectations, Historique. Différence
  avec « Suivi des gardes » : Gardes sert à **agir** (assigner, créer, réassigner, annuler…) ;
  « Suivi des gardes » (Administrateur) sert à **superviser** (indicateurs, statistiques par
  surveillant, export CSV), sans action.
- **Administrateur** — `frontend/src/features/admin/AdminLayout.tsx` ; l'entrée n'est ajoutée au
  menu que pour le super administrateur (`AppLayout.tsx:234`) et la page affiche « Accès réservé »
  pour les autres. Protection serveur : `SuperAdminGuard` (`backend/src/audit/super-admin.guard.ts`,
  règle `canManageAdministration`, `backend/src/common/authorization.ts:29`) sur chaque contrôleur
  `/api/admin/*`, avec refus journalisé (`ACCESS_DENIED`).
- **Profil et déconnexion** — le bloc profil (nom et rôle) est un lien vers « Mon profil »
  (`/profil`, `ProfilePage.tsx`, spec 005 ; `ProfileLink`, `AppLayout.tsx:181`) : nom,
  identifiant, fonction, rôle et groupes d'affectation en lecture seule (champs `username` et
  `jobTitle` de `GET /api/auth/me`), et « Changer mon mot de passe ». Changement de mot de passe :
  route `/mot-de-passe` et `POST /api/auth/password`, imposé à la première connexion (sans
  annulation, puis accueil) ou volontaire depuis le profil (« Annuler », retour au profil avec
  confirmation) ; il ferme les autres sessions (`backend/src/auth/auth.service.ts:76`). Déconnexion : suppression de la session en base et
  fermeture des connexions temps réel (`auth.service.ts:52-54`), journalisée (`LOGOUT`).

### 1.2 Visibilité du menu par rôle

| Entrée | Employé | Admin | Super administrateur |
| --- | --- | --- | --- |
| Cloche | ✅ | ✅ | ✅ (alertes filtrées) |
| Mes demandes : Reçues, Envoyées | ✅ | ✅ | ✅ |
| Mes demandes : À valider, Suivi | ❌ | ✅ | ✅ |
| Nouvelle demande | ✅ | ✅ (toute catégorie) | ✅ (toute catégorie) |
| Gardes | si membre du groupe Surveillants ou Enseignants | ✅ | ✅ |
| Administrateur | ❌ | ❌ | ✅ |
| Bloc profil, Se déconnecter | ✅ | ✅ | ✅ |

### 1.3 Mobile et desktop

`AppLayout.tsx` change de disposition à partir du point de rupture `md` (900 px) :

- **desktop** : barre latérale fixe (logo et cloche, menu, bloc profil et bouton « Se
  déconnecter » en bas) ;
- **mobile** : barre du haut (bouton « Ouvrir le menu », logo, cloche, icône de déconnexion) ;
  le menu s'ouvre dans un tiroir latéral.

## 2. Administrateur, onglet par onglet

Toutes les routes ci-dessous sont protégées par `SuperAdminGuard` (contrôleur indiqué). Onglets :
Tableau de bord, Suivi des gardes, Comptes, Catégories, Groupes, Étages, Classes, Réglages,
Journal d'audit (`AdminLayout.tsx:21-30`).

### 2.1 Tableau de bord (`/admin/tableau-de-bord`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Filtres : période (7, 30, 90 jours ou personnalisée), catégorie, priorité, employé | `DashboardPage.tsx` | `dashboard.controller.ts:8` | Complète |
| « À traiter maintenant » : en retard, urgentes en cours, sans employé affecté, alertes avec lien | `GET /api/admin/dashboard/summary` | idem | Complète |
| Compteurs par état, graphiques (répartition, évolution quotidienne) avec vue tableau | idem | idem | Complète |
| Délais : première réponse (premier message d'une autre personne que le demandeur), prise en charge, traitement net et brut, taux de respect, par priorité | `GET …/performance` | idem | Complète |
| Activité par employé | `GET …/employees` | idem | Complète |
| Liste des demandes | `GET /api/requests?scope=all` | visibilité des demandes | Complète |
| Fil d'activité (métadonnées seulement) | `GET …/activity` | idem | Complète |
| Export CSV des demandes de la période (mêmes filtres ; métadonnées, dates et délais, sans description ni message) | `GET …/export.csv` | idem | Complète |

Périmètre : demandes de travail uniquement ; actualisation en direct à chaque mise à jour de demande
(salle Socket.IO des super administrateurs) et toutes les 60 s. L'onglet Employés liste aussi, à zéro,
les comptes actifs sans demande sur la période.

### 2.2 Suivi des gardes (`/admin/suivi`, page « Suivi des affectations »)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Chiffres clés : en attente, assignées, en cours, en retard, retards, non pourvues, relèves demandées, affectations effectuées | `CoverageDashboardPage.tsx`, `GET /api/admin/coverage/dashboard` | `coverage-admin.controller.ts:12` | Complète |
| Affectations en cours : classe, statut, surveillant affecté, durée | idem | idem | Complète |
| Par surveillant : disponibilité, affectation en cours, statistiques | idem | idem | Complète |
| Filtres (surveillant, classe, statut, étage, Du/Au), export CSV et impression | `GET …/export.csv` (`CoverageDashboardPage.tsx:146`) | idem | Complète |
| Absences des surveillants | disponibilité « Absent » (Gardes › Équipe) | idem | Partielle : pas de vue dédiée |

Statistiques détaillées (par enseignant, classe ou période, semaine ou mois) : page
`/gardes/statistiques` (`CoverageStatsPage.tsx`), `GET /api/coverage/stats`
(`coverage.controller.ts`), admins et super administrateur. Export CSV de la vue affichée
(spec 008) : « Exporter en CSV », `GET /api/coverage/stats/export.csv`, mêmes accès et mêmes
valeurs que la page, chaque export journalisé.

### 2.3 Comptes (`/admin/comptes`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Liste, création (identifiant, nom, fonction, rôle Employé / Admin / Super administrateur, catégories destinataires) | `UsersAdminPage.tsx`, `UserFormDialog.tsx`, `GET`/`POST /api/admin/users` | `admin-users.controller.ts:11` | Complète |
| Modification, rattachement aux catégories (« Destinataire : … ») | `PATCH /api/admin/users/:id` | idem | Complète |
| Réinitialisation du mot de passe : mot de passe provisoire affiché une fois, état « Mot de passe à changer » | `POST …/:id/reset-password` | idem | Complète |
| Désactivation et réactivation (sessions fermées à la désactivation) | `PATCH …/:id` | idem, `users.service.ts:208` | Complète |
| Garde-fous serveur sur son propre compte | `users.service.ts:154-157`, `:216-217` | serveur | Complète : un super administrateur ne peut ni se désactiver, ni retirer son propre rôle, ni réinitialiser son propre mot de passe par requête directe |

### 2.4 Catégories (`/admin/categories`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Création et modification : nom, type (demande de travail ou garde, figé à la création), mode de routage (via l'administration, direct, entre enseignants), rôles créateurs, clôture, validation finale, affectation automatique, photo de preuve | `CategoryFormDialog.tsx`, `POST`/`PATCH /api/admin/categories` | `admin-categories.controller.ts:11` | Complète |
| Destinataires et « Admins de la catégorie » (rôle Admin ou Super administrateur uniquement, `admin-categories.service.ts:232-237`) | `PUT …/:id/recipients`, `…/:id/managers` | idem | Complète |
| Délais par priorité | `PUT …/:id/deadlines` | idem | Complète |
| Activation et désactivation | case « active » du formulaire | idem | Complète |
| Rafraîchissement du formulaire « Nouvelle demande » | liste rechargée à chaque ouverture (`requests/api.ts`) | — | Complète |

### 2.4 bis Consignes (`/admin/consignes`, fonctionnalité 009)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Liste (titre, portée « Générale » ou catégorie, état, date et auteur de la modification) | `GuidelinesAdminPage.tsx`, `GET /api/admin/guidelines` | `SuperAdminGuard` (`admin-guidelines.controller.ts`) | Complète |
| Création et modification : titre (120), texte (4 000), portée (générale ou catégorie de demande de travail), active | `GuidelineFormDialog.tsx`, `POST`/`PATCH /api/admin/guidelines` | idem | Complète |
| Activation, désactivation, suppression confirmée | `PATCH`/`DELETE /api/admin/guidelines/:id` | idem | Complète |
| Journal d'audit : « Consigne créée / modifiée / supprimée » + titre, jamais le texte | `GUIDELINE_CHANGED` | — | Complète |

Les consignes actives servent aux **propositions automatiques** du formulaire « Nouvelle
demande » (catégorie, priorité, titre), visibles seulement des demandeurs autorisés pour la
catégorie. L'assistance est désactivée par défaut (`ASSIST_*_PROVIDER=disabled`) ; le fournisseur
`demo` sert aux démonstrations, sans appel externe.

### 2.5 Groupes, Étages et Classes (`/admin/groupes`, `/admin/etages`, `/admin/classes`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Groupes : nom, actif, membres ; groupes à clé système « Surveillants » et « Enseignants » (renommables, jamais désactivés) | `GroupsAdminPage.tsx`, `/api/admin/coverage/groups` | `coverage-admin.controller.ts:12` | Complète |
| Étages : nom, ordre d'affichage, actif ; avertissement si aucun surveillant n'y est rattaché | `FloorsAdminPage.tsx`, `/api/admin/floors` | `coverage-admin.controller.ts:74` | Complète |
| Classes : nom, salle, étage (obligatoire), active ; QR code imprimable et révocable | `ClassesAdminPage.tsx`, `/api/admin/coverage/classes`, `…/qr`, `…/qr/revoke` | `coverage-admin.controller.ts:12` | Complète |

Usage : les membres du groupe **Surveillants** peuvent être assignés et déclarer une classe vide ;
ceux du groupe **Enseignants** peuvent signaler un retard ou une absence ; l'appartenance à l'un
des deux fait apparaître le menu Gardes. Les autres groupes n'ont pas d'effet sur les
affectations. Les **étages** ordonnent les surveillants proposés (ceux de l'étage de la classe
d'abord) ; les **classes** sont le lieu de l'affectation et portent le QR code de preuve de
présence. Rien de tout cela n'intervient dans le routage ou la visibilité des demandes de travail.

### 2.6 Réglages (`/admin/reglages`)

| Paramètre | Valeur par défaut | État |
| --- | --- | --- |
| Durée maximale d'un vocal, taille maximale | 180 s, 5 Mo | Complète |
| Taille maximale d'une pièce jointe, nombre par message | 10 Mo, 5 | Complète |
| Formats de photo et de document acceptés | JPEG, PNG, WebP ; PDF | Complète |
| Brouillons de demande autorisés | oui | Complète (spec 007) |
| Seuil d'alerte avant échéance | 20 % | Complète |
| Inactivité et durée maximale de session | 60 min, 12 h | Complète |
| Affectations : seuil d'urgence avant le début du créneau, escalade au super administrateur | 60 min, 5 min | Complète |
| Affectations : rappel du matin, rappel de clôture puis rappel à l'admin | 07:00 ; 10 min, 10 min | Complète |
| Affectations : rappels de renfort (intervalle, nombre maximal) | 10 min, 3 | Complète |
| Affectations : conservation avant anonymisation | 12 mois | Complète |
| Permissions par rôle (créer, priorité, réaffecter, audit…) | `GET`/`PUT /api/admin/role-permissions` | Complète |

Endpoints `GET`/`PUT /api/admin/settings` (`admin-settings.controller.ts:10`), valeurs par défaut
dans `backend/src/settings/settings.service.ts:9-30`. Les délais de traitement par priorité se
règlent par catégorie (§2.4), pas ici ; le délai de prise en charge d'une affectation est celui de
la catégorie de garde.

### 2.7 Journal d'audit (`/admin/journal`)

Consultation seule, filtres par auteur, action et période (`admin-audit.controller.ts:57`).

| Événement | Enregistré | Source |
| --- | --- | --- |
| Connexion réussie ou échouée, déconnexion | ✅ | `auth.service.ts` |
| Accès refusé | ✅ | gardes et services |
| Compte créé, modifié (dont changement de rôle et réactivation), désactivé | ✅ | `users.service.ts` |
| Réinitialisation et changement de mot de passe | ✅ | `users.service.ts`, `auth.service.ts` |
| Permissions, réglages, catégories, délais | ✅ | `admin-settings.service.ts`, `admin-categories.service.ts` |
| Groupes, étages, classes, révocation de QR, disponibilité | ✅ | `coverage-admin.service.ts`, `coverage.service.ts` |
| Affectations : assignation, réassignation, libération, validation, annulation, enseignant corrigé, renfort libéré, **modification de la classe ou du créneau** (spec 006, `details.action = 'UPDATE'`, avant et après, sans le motif) (« Affectation gérée par un admin ») | ✅ `COVERAGE_MANAGED` | `coverage-actions.service.ts:71-79`, `coverage.service.ts` (`updateCoverage`) |
| Affectation directe (« Affectation créée ») | ✅ `COVERAGE_CREATED` | `coverage.service.ts:441` |
| Décision sur un doublon possible | ✅ `COVERAGE_MERGE_DECIDED` | `coverage-declarations.service.ts` |
| Anonymisation des affectations anciennes (tâche planifiée) | ✅ `COVERAGE_ANONYMIZED` | `coverage-anonymization.service.ts:87` |
| Export des statistiques des affectations (période et regroupement, sans valeur ni nom ; spec 008) | ✅ `COVERAGE_STATS_EXPORTED` | `coverage-stats.service.ts` (`exportCsv`) |
| Signalement d'un enseignant, classe vide déclarée, actions du surveillant (en route, présence, fin) | ❌ par choix (historique de l'affectation) | `RequestEvent` |
| Demandes de travail : approbation, refus, réaffectation, annulation, validation finale, renvoi à corriger, changement de priorité (motif signalé, sans son texte) | ✅ `REQUEST_MANAGED` | `request-transitions.service.ts:53`, `requests.service.ts` |
| Demandes de travail : accepter, commencer, terminer, décliner (actions courantes de l'employé) | ❌ par choix (historique de la demande) | `RequestEvent` |
| Changement de rôle comme événement distinct | ❌ (inclus dans « Compte modifié ») | — |

## 3. Affectation des surveillants

| Question | Réponse dans le code |
| --- | --- |
| Qui gère les affectations | Les admins et le super administrateur (`isCoverageAdmin`, `coverage-policy.ts:56`). Le compte `admin` du seed joue la surveillante générale. |
| D'où vient une affectation | Trois sources : **signalement d'un enseignant** (retard ou absence, `POST /api/coverage/teacher-requests`, « En attente » jusqu'à l'assignation) ; **classe vide** déclarée par un surveillant pendant son tour (`POST /api/coverage/empty-class`, à son nom et en cours) ; **affectation directe** par un admin (`POST /api/coverage`, `coverage.service.ts:327`, créée assignée). |
| Qui peut être assigné | Un membre actif du groupe Surveillants, quel que soit son rôle (`isEligibleAssignee`, `coverage-policy.ts:61`). Surveillants proposés : ceux de l'étage de la classe d'abord, disponibles d'abord (`supervisorCandidates`, `coverage-availability.ts:94`). |
| Qui assigne, réassigne, retire, modifie | L'admin : `ASSIGN`, `REASSIGN`, `RELEASE_BY_MANAGER`, `RELEASE_SUPPORT` (renfort), `CANCEL`, `SET_TEACHER`, et **modification** de la classe et du créneau (`PATCH /api/coverage/:id`, spec 006) : classe, date et heures avant la présence, heure de fin seulement pendant la présence (`modifiableFields`, `domain/coverage-modification.ts`), statut inchangé (« En route » compris), disponibilité revérifiée avec refus qui nomme l'affectation en conflit. L'enseignant modifie ou retire son signalement tant qu'il est en attente (`PATCH /api/coverage/:id/teacher-request`, `WITHDRAW`). |
| Remplacement d'un surveillant absent | Disponibilité « Absent » (Gardes › Équipe), puis réassignation de ses affectations par l'admin. Pendant l'affectation : le surveillant demande une relève (`REQUEST_RELIEF`). |
| Ce que voit le surveillant | Notification « Demande affectée », onglets « Mes affectations » et « Historique », « Je suis en route », confirmation de présence par QR code de la classe et photo (selon la catégorie de garde), « Terminer ». Le motif du signalement ne lui est jamais montré (`canSeeReason`, `coverage-policy.ts:101`). |
| Doublons | Classe vide déjà prise en charge : le second déclarant devient **renfort** ; déclaration proche d'une affectation existante : **proposition de rattachement** à trancher par l'admin (onglet Doublons, `coverage-declarations.service.ts:309-321`). |
| Délais | Signalement non assigné à temps : rappel aux admins, escalade au super administrateur, puis « Non pourvue » (`EXPIRE_UNFILLED`, `coverage-reminders.job.ts:101`). |
| Traçabilité | Journal d'audit (§2.7) ; historique de l'affectation (`RequestEvent`), par exemple « Réassignée de … à … ». |
| Conflits gérés | Disponibilité vérifiée côté serveur (`availabilityFor`, `coverage-availability.ts:27`) : compte désactivé, absent, indisponible, déjà affecté sur un créneau qui chevauche ou en renfort → refus `NOT_AVAILABLE` (`coverage-state-machine.ts:167`) ; l'interface désactive ces surveillants. Double prise simultanée empêchée par un verrou par employé (`lockEmployee`, `coverage-availability.ts:124`). |
| Conflits non gérés | Plus de forçage depuis la 004 : un surveillant indisponible ne peut pas être assigné, même par le super administrateur. |

## 4. Écarts

### 4.1 Interface et serveur

- Aucune fonctionnalité de l'interface trouvée sans protection serveur : chaque action passe par
  une règle côté API (gardes globales, `SuperAdminGuard`, politiques d'accès).
- La référence des demandes reste affichée dans le panneau de notifications alors qu'elle est
  masquée dans le détail et la liste.

### 4.2 Actions absentes

- Réaffecter une demande de travail en mode direct ou entre enseignants : impossible par choix
  (lecture seule de l'administration) ; seul le mode via l'administration le permet.
- Suppression d'une affectation : absente (annulation motivée à la place). La modification de la
  classe et du créneau par l'admin existe depuis la spec 006 (§3).

### 4.3 Fonctionnalités partielles ou inutilisées

- Absences des surveillants : seulement via la disponibilité « Absent », sans vue dédiée.

### 4.4 Scénarios de démonstration (`demo/`)

| Scénario | Jouable | Remarque |
| --- | --- | --- |
| S01 Menu latéral | Oui | Bloc profil : lien vers « Mon profil » (spec 005). |
| S02 Notifications | Oui | Demande « sans employé affecté » et « en retard » : délais simulés dans la base jetable. |
| S03 Mes demandes | Oui | « Reçues » ne montre que les demandes affectées au super administrateur ; annulation sur sa propre demande ; changement de priorité en mode via l'administration. |
| S04 Nouvelle demande | Oui | « Surveillance » et « Photocopies » à créer dans les données fictives. |
| S05 Comptes | Oui | — |
| S06 Catégories | Oui | — |
| S07 Groupes et Classes | Oui | Un employé ajouté au groupe Surveillants, une classe sur un étage, puis une affectation directe. |
| S08 Réglages | Oui | Effet visible : seuil d'alerte (compte à rebours orange) ou délai d'une catégorie. |
| S09 Journal d'audit | Oui | Actions administratives sur les demandes de travail et affectations journalisées ; actions courantes de l'employé dans l'historique seul. |
| S10 Tableau de bord | Oui | — |
| S11 Suivi des gardes | Oui | Signalement d'enseignant en attente, affectation en cours, affectation annulée. |
| S12 Affectation des surveillants | Oui | Signalement assigné ; surveillant déjà affecté non proposable ; absent remplacé par réassignation. |
| S13 Vue du surveillant | Oui | Viewport mobile ; notification et onglet « Mes affectations ». |
