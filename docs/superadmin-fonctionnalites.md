# Fonctionnalités du super administrateur — inventaire

> **Document daté, antérieur à la fonctionnalité 004** : le rôle « Responsable » (`MANAGER`) y est
> devenu « Admin » (`ADMIN`) et la diffusion des gardes a été remplacée par l'assignation par l'admin.
> Voir `specs/004-retards-affectation-surveillants/` (migration : `contracts/migration.md`).

> Établi le 2026-10-16 à partir du code de `master` (`258df07`, après les PR #6, #7, #9, #10 et
> #11). Les références `fichier:ligne` pointent vers ce commit. « Serveur » = contrôle effectué par
> l'API, indépendamment de l'interface. Aucun fichier de l'application n'a été modifié pour cet
> inventaire.

## Données de démonstration déjà présentes

Le seed de démonstration crée des catégories marquées « démo » : « Intervention technique (démo
circuit B) » et « Petits travaux (démo photo) ». Elles sont présentes dans la base de
développement, avec la garde « Garde de classe » renommée « Garde surveillance » et la catégorie de
travail « Surveillance » créées le 2026-10-16. Elles sont signalées ici et n'ont pas été supprimées.

## 1. Menu latéral

### 1.1 Entrées du menu

Rôles : Employé (`EMPLOYEE`), Responsable (`MANAGER`), Super administrateur (`SUPER_ADMIN`). Toutes
les routes de l'API exigent une session valide (garde globale `SessionGuard`,
`backend/src/auth/auth.module.ts:27`).

| Entrée | Route | Rôles autorisés | Actions disponibles (super administrateur) | État |
| --- | --- | --- | --- | --- |
| Cloche de notifications | panneau (pas de route) | tous | liste, badge du nombre de non lues, clic qui ouvre la demande et la marque lue, « Tout marquer comme lu » | Complète |
| Mes demandes | `/` (onglets `?onglet=`) | tous | onglets Reçues, Envoyées, À valider, Suivi ; recherche ; filtres ; détail | Complète |
| Nouvelle demande | `/demandes/nouvelle` | tous (selon les catégories) | création dans toute catégorie de demande de travail active | Complète |
| Gardes | `/gardes`, `/gardes/nouvelle`, `/gardes/:id`, `/gardes/presence` | membres d'un groupe de remplacement, responsables d'une catégorie de garde, super administrateur | onglets En cours, Équipe, Terminées ; création ; actions sur une garde | Complète (voir §3) |
| Administration | `/admin/*` | super administrateur | 8 onglets (§2) | Complète |
| Bloc profil | (pas de route) | tous | affichage du nom et du rôle uniquement | Partielle (voir §4) |
| Se déconnecter | `POST /api/auth/logout` | tous | fin de session | Complète |

Détail par entrée :

- **Cloche** — composant `frontend/src/features/notifications/NotificationCenter.tsx` ; API
  `GET /api/notifications` et `POST /api/notifications/read`
  (`backend/src/notifications/notifications.controller.ts:42` et `:75`), limitées aux
  notifications de l'utilisateur connecté. Filtrage du super administrateur côté serveur, à la
  création de chaque notification (`backend/src/notifications/super-admin-policy.ts:41`,
  appliqué dans `notifications.service.ts`) : sur une demande de travail dont il n'est ni
  demandeur ni destinataire, il ne reçoit que les alertes « Demande urgente », « Demande sans
  responsable » (délai bientôt dépassé, type `UNASSIGNED`) et « Demande en retard », une fois par
  demande et par type, plus les messages d'une demande urgente ou en retard ; rien sur une demande
  terminée, refusée ou annulée. Les alertes « sans responsable » et « en retard » sont posées par
  une tâche planifiée (`backend/src/scheduler/super-admin-alerts.job.ts`, toutes les 15 s au
  plus). Les gardes ne sont pas filtrées. Le panneau affiche la référence de la demande
  (`D-AAAA-NNNNNN`, `NotificationCenter.tsx:118`), masquée ailleurs (§4).
- **Mes demandes** — `frontend/src/features/requests/RequestListPage.tsx`, API
  `GET /api/requests?scope=` (`backend/src/requests/requests.controller.ts:36`). Visibilité du super
  administrateur : toutes les demandes de travail sauf les brouillons des autres
  (`backend/src/requests/domain/visibility.ts:19`).
  - « Reçues » (`scope=assigned`) : **seulement les demandes dont il est la personne affectée**,
    pas toutes les demandes.
  - « Envoyées » (`scope=mine`) : ses propres demandes.
  - « À valider » (responsables et super administrateur) : demandes en attente de validation
    administrative ou de validation finale, toutes catégories pour le super administrateur.
  - « Suivi » (responsables et super administrateur, `scope=all`) : toutes les demandes visibles.
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
  (`access-policy.ts`, `canCreateInCategory`). Les catégories de garde n'y figurent jamais (elles se
  créent depuis Gardes). Champs : catégorie, destinataire (mode direct : service présélectionné s'il
  est seul ; entre enseignants : collègue à choisir ; via l'administration : aucun), priorité,
  titre, message vocal, description (l'un des deux suffit). Pas de pièce jointe ni de brouillon à
  la création.
- **Gardes** — `frontend/src/features/coverage/CoveragePage.tsx` ; API `/api/coverage/*`
  (`backend/src/coverage/coverage.controller.ts`). Affichage du menu si l'utilisateur est membre
  d'un groupe actif ou gestionnaire de gardes (`AppLayout.tsx:147`) ; gestionnaire = super
  administrateur ou responsable d'une catégorie de garde (`coverage.service.ts:455`). Différence
  avec « Suivi des gardes » : Gardes sert à **agir** (créer, affecter, annuler…) ; « Suivi des
  gardes » (Administration) sert à **superviser** (indicateurs, statistiques par employé, export
  CSV), sans action.
- **Administration** — `frontend/src/features/admin/AdminLayout.tsx` ; l'entrée n'est ajoutée
  au menu que pour le super administrateur (`AppLayout.tsx:151`) et la page affiche « Accès
  réservé » pour les autres. Protection serveur : `SuperAdminGuard`
  (`backend/src/audit/super-admin.guard.ts`, règle `canManageAdministration`,
  `backend/src/common/authorization.ts:29`) sur chaque contrôleur `/api/admin/*`, avec refus
  journalisé (`ACCESS_DENIED`).
- **Profil et déconnexion** — le bloc profil affiche le nom et le rôle, sans lien ni page de
  profil. Changement de mot de passe : route `/mot-de-passe` et `POST /api/auth/password`, imposée
  à la première connexion, sans lien dans le menu ; elle ferme les autres sessions
  (`backend/src/auth/auth.service.ts:76`). Déconnexion : suppression de la session en base et
  fermeture des connexions temps réel (`auth.service.ts:52-54`), journalisée (`LOGOUT`).

### 1.2 Visibilité du menu par rôle

| Entrée | Employé | Responsable | Super administrateur |
| --- | --- | --- | --- |
| Cloche | ✅ | ✅ | ✅ (alertes filtrées) |
| Mes demandes : Reçues, Envoyées | ✅ | ✅ | ✅ |
| Mes demandes : À valider, Suivi | ❌ | ✅ | ✅ |
| Nouvelle demande | ✅ | ✅ (toute catégorie) | ✅ (toute catégorie) |
| Gardes | si membre d'un groupe | si responsable d'une catégorie de garde (ou membre d'un groupe) | ✅ |
| Administration | ❌ | ❌ | ✅ |
| Bloc profil, Se déconnecter | ✅ | ✅ | ✅ |

### 1.3 Mobile et desktop

`AppLayout.tsx` change de disposition à partir du point de rupture `md` (900 px) :

- **desktop** : barre latérale fixe (logo et cloche, menu, bloc profil et bouton « Se
  déconnecter » en bas) ;
- **mobile** : barre du haut (bouton « Ouvrir le menu », logo, cloche, icône de déconnexion) ;
  le menu s'ouvre dans un tiroir latéral.

## 2. Administration, onglet par onglet

Toutes les routes ci-dessous sont protégées par `SuperAdminGuard` (contrôleur indiqué).

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

### 2.2 Suivi des gardes (`/admin/suivi`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Indicateurs (à prendre, non pourvues, prises, en retard, en poste, relève, terminées, annulées) | `CoverageDashboardPage.tsx`, `GET /api/admin/coverage/dashboard` | `coverage-admin.controller.ts:12` | Complète |
| Gardes en cours : classe, statut, personne affectée, durée | idem | idem | Complète |
| Employés : disponibilité, garde en cours, statistiques | idem | idem | Complète |
| Groupes vides ou sans membre disponible | idem | idem | Complète |
| Filtres (employé, classe, statut, groupe, période) et export CSV | `GET …/export.csv` | idem | Complète |
| Remplacements et absences | via statuts « Relève demandée » et disponibilité « Absent » | idem | Partielle : pas de vue dédiée aux absences |

### 2.3 Comptes (`/admin/comptes`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Liste, création (identifiant, nom, fonction, rôle, catégories destinataires) | `UsersAdminPage.tsx`, `UserFormDialog.tsx`, `GET`/`POST /api/admin/users` | `admin-users.controller.ts:11` | Complète |
| Modification, rattachement aux catégories (« Destinataire : … ») | `PATCH /api/admin/users/:id` | idem | Complète |
| Réinitialisation du mot de passe : mot de passe provisoire affiché une fois, état « Mot de passe à changer » | `POST …/:id/reset-password` | idem | Complète |
| Désactivation et réactivation (sessions fermées à la désactivation) | `PATCH …/:id` | idem, `users.service.ts:182` | Complète |
| Garde-fous serveur sur son propre compte | `users.service.ts:149-151`, `:209-210` | serveur | Complète : un super administrateur ne peut ni se désactiver, ni retirer son propre rôle, ni réinitialiser son propre mot de passe par requête directe |

### 2.4 Catégories (`/admin/categories`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Création et modification : nom, type (demande de travail ou garde, figé à la création), mode de routage (via l'administration, direct, entre enseignants), rôles créateurs, clôture, validation finale, affectation automatique, photo de preuve | `CategoryFormDialog.tsx`, `POST`/`PATCH /api/admin/categories` | `admin-categories.controller.ts:11` | Complète |
| Destinataires et responsables | `PUT …/:id/recipients`, `…/:id/managers` | idem | Complète |
| Délais par priorité | `PUT …/:id/deadlines` | idem | Complète |
| Activation et désactivation | case « active » du formulaire | idem | Complète |
| Rafraîchissement du formulaire « Nouvelle demande » | liste rechargée à chaque ouverture (`requests/api.ts`) | — | Complète |

### 2.5 Groupes et Classes (`/admin/groupes`, `/admin/classes`)

| Fonctionnalité | Fichier / endpoint | Autorisation | État |
| --- | --- | --- | --- |
| Groupes : nom, actif, membres | `GroupsAdminPage.tsx`, `/api/admin/coverage/groups` | `coverage-admin.controller.ts:12` | Complète |
| Classes : nom, salle, active ; QR code imprimable et révocable | `ClassesAdminPage.tsx`, `/api/admin/coverage/classes`, `…/qr`, `…/qr/revoke` | idem | Complète |

Usage : les **groupes** désignent les employés qui peuvent prendre une garde (diffusion, onglet
« À prendre ») et font apparaître le menu Gardes à leurs membres ; les **classes** sont le lieu
d'une garde et portent le QR code de preuve de présence. Ni l'un ni l'autre n'interviennent dans le
routage ou la visibilité des demandes de travail.

### 2.6 Réglages (`/admin/reglages`)

| Paramètre | Valeur par défaut | État |
| --- | --- | --- |
| Durée maximale d'un vocal, taille maximale | 180 s, 5 Mo | Complète |
| Taille maximale d'une pièce jointe, nombre par message | 10 Mo, 5 | Complète |
| Formats de photo et de document acceptés | JPEG, PNG, WebP ; PDF | Complète |
| Brouillons de demande autorisés | oui | Partielle : aucun écran ne crée de brouillon |
| Seuil d'alerte avant échéance | 20 % | Complète |
| Inactivité et durée maximale de session | 60 min, 12 h | Complète |
| Permissions par rôle (créer, priorité, réaffecter, audit…) | `GET`/`PUT /api/admin/role-permissions` | Complète |

Endpoints `GET`/`PUT /api/admin/settings` (`admin-settings.controller.ts:10`). Les délais de
traitement par priorité se règlent par catégorie (§2.4), pas ici.

### 2.7 Journal d'audit (`/admin/journal`)

Consultation seule, filtres par auteur, action et période (`admin-audit.controller.ts:57`).

| Événement | Enregistré | Source |
| --- | --- | --- |
| Connexion réussie ou échouée, déconnexion | ✅ | `auth.service.ts` |
| Accès refusé | ✅ | gardes et services |
| Compte créé, modifié (dont changement de rôle et réactivation), désactivé | ✅ | `users.service.ts` |
| Réinitialisation et changement de mot de passe | ✅ | `users.service.ts`, `auth.service.ts` |
| Permissions, réglages, catégories, délais | ✅ | `admin-settings.service.ts`, `admin-categories.service.ts` |
| Groupes, classes, révocation de QR, disponibilité | ✅ | `coverage-admin.service.ts`, `coverage.service.ts` |
| Gardes : affectation, réaffectation, élargissement, libération, validation, annulation | ✅ | `coverage-actions.service.ts:62` |
| Création d'une garde (catégorie, classe, groupes ciblés) | ✅ `COVERAGE_CREATED` | `coverage.service.ts` |
| Demandes de travail : approbation, refus, réaffectation, annulation, validation finale, renvoi à corriger, changement de priorité (motif signalé, sans son texte) | ✅ `REQUEST_MANAGED` | `request-transitions.service.ts`, `requests.service.ts` |
| Demandes de travail : accepter, commencer, terminer, décliner (actions courantes de l'employé) | ❌ par choix (historique de la demande) | `RequestEvent` |
| Changement de rôle comme événement distinct | ❌ (inclus dans « Compte modifié ») | — |

## 3. Affectation des surveillants aux gardes

| Question | Réponse dans le code |
| --- | --- |
| Qui crée une garde | Gestionnaire de gardes : super administrateur ou responsable d'une catégorie de garde (`coverage.service.ts:455`). Il n'existe ni rôle « surveillante générale » ni rôle « surveillant » (spec 004 non réalisée). |
| Qui affecte, réaffecte, retire | Le gestionnaire : `ASSIGN`, `REASSIGN` (avant la présence), `RELEASE_BY_MANAGER` (motif), `CANCEL` (motif). Le surveillant peut aussi **prendre** une garde diffusée (`ACCEPT`) ou s'en **libérer** avant la présence (`RELEASE`). |
| Remplacement d'un surveillant absent | Avant la présence : `REASSIGN` par le gestionnaire. Pendant la garde : le surveillant demande une relève (`REQUEST_RELIEF`), qui crée une demande de relève diffusée ; le remplaçant est relevé à la confirmation de présence. |
| Mode d'affectation | Diffusion aux membres disponibles des groupes ciblés, puis premier qui accepte ; ou affectation manuelle par le gestionnaire. Pas d'affectation automatique. Créneau = heure de début et durée prévue (ou fin ouverte). Les classes sont le lieu, pas un critère d'affectation. |
| Ce que voit le surveillant | Notification (« Garde à prendre », « Demande affectée »…), onglets « À prendre » et « Ma garde », confirmation de présence par photo et/ou QR code. |
| Traçabilité | Journal d'audit `COVERAGE_MANAGED` pour affectation, réaffectation, élargissement, libération, validation, annulation, avec `forced: true` si l'indisponibilité a été passée outre ; historique de la garde (`RequestEvent`). Création journalisée (`COVERAGE_CREATED`) ; prise volontaire non journalisée dans l'audit. |
| Conflits gérés | Disponibilité vérifiée côté serveur (`coverage-availability.ts:52-54`) : compte inactif, absent, indisponible, ou déjà en garde sur un créneau qui chevauche → refus `NOT_AVAILABLE` (`coverage-state-machine.ts:153-155`). Double prise simultanée empêchée par un verrou par employé (`coverage-actions.service.ts:161-165`). Seul un employé actif de rôle Employé peut être affecté (`coverage-actions.service.ts:630`). |
| Conflits non gérés | Le gestionnaire peut **forcer** l'affectation d'un employé indisponible (absent, déjà en garde) : tracé, mais pas bloqué. Aucun contrôle d'appartenance au groupe ciblé pour l'affectation manuelle. |

## 4. Écarts

### 4.1 Interface et serveur

- Aucune fonctionnalité de l'interface trouvée sans protection serveur : chaque action passe par
  une règle côté API (gardes globales, `SuperAdminGuard`, politiques d'accès).
- Inverse : l'API permet au super administrateur de **forcer** une affectation de garde sur un
  employé indisponible ; l'interface le propose aux gestionnaires (choix tracé).
- La référence des demandes reste affichée dans le panneau de notifications alors qu'elle est
  masquée dans le détail et la liste.

### 4.2 Actions absentes

- Pas de page de profil ni de lien « Changer mon mot de passe » (le serveur y renvoie pourtant
  dans son message de refus, `users.service.ts:210`).
- Réaffecter une demande de travail en mode direct ou entre enseignants : impossible par choix
  (lecture seule de l'administration) ; seul le mode via l'administration le permet.
- Modification d'une garde (classe, horaire) : absente ; seules la prolongation et l'élargissement
  existent. Suppression : absente (annulation motivée à la place).

### 4.3 Fonctionnalités partielles ou inutilisées

- Brouillons : réglage et API présents, aucun écran pour en créer.
- Vue des absences dans « Suivi des gardes » : seulement via la disponibilité « Absent ».
- Rôles « Admin », « Surveillant », « Enseignant » de la spec 004 : non réalisés.

### 4.4 Scénarios de la phase 2

| Scénario | Jouable | Remarque |
| --- | --- | --- |
| S01 Menu latéral | Oui | Bloc profil sans page de profil (à montrer tel quel). |
| S02 Notifications | Oui | Demande « sans responsable » et « en retard » : délais simulés dans la base jetable. |
| S03 Mes demandes | Oui | « Reçues » ne montre que les demandes affectées au super administrateur ; annulation sur sa propre demande ; changement de priorité en mode via l'administration. |
| S04 Nouvelle demande | Oui | « Surveillance » et « Photocopies » à créer dans les données fictives. |
| S05 Comptes | Oui | — |
| S06 Catégories | Oui | — |
| S07 Groupes et Classes | Oui | « Utilisation » montrée en ciblant le groupe et la classe dans une garde. |
| S08 Réglages | Oui | Effet visible : seuil d'alerte (compte à rebours orange) ou délai d'une catégorie. |
| S09 Journal d'audit | Oui | Actions administratives sur les demandes de travail et création de garde journalisées ; actions courantes de l'employé dans l'historique seul. |
| S10 Tableau de bord | Oui | — |
| S11 Suivi des gardes | Oui | — |
| S12 Affectation des surveillants | Partiel | Conflit de double affectation détecté (refus « indisponible ») ; remplacement par réaffectation avant présence ; pas de rôle « surveillante générale ». |
| S13 Vue du surveillant | Oui | Viewport mobile ; notification et onglet « Ma garde ». |
