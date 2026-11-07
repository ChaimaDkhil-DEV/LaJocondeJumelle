# Super administrator features — inventory

> Drawn up on 2026-10-16 from `258df07`, updated on 2026-10-21 from the code of `master`
> (`186f7f2`, after feature 004, PR #18). The `file:line` references point to this
> commit. "Server" = check performed by the API, independently of the interface. No file of the
> application was modified for this inventory. Profile block and "Mon profil" (My profile) (§1.1, §4) updated
> for spec 005 (2026-10-22); the `AppLayout.tsx` references point to this code.
> Modification of an assignment by the admin (§2.7, §3, §4.2) updated for spec 006.
> Export of assignment statistics (§2.2, §2.7, §4.3) updated for spec 008.
>
> Since 004: the "Responsable" (Manager) role (`MANAGER`) has become "Admin" (`ADMIN`, migration
> 0009); broadcasting of shifts is replaced by the assignment of a supervisor by an admin
> (§3). See `specs/004-retards-affectation-surveillants/`.

## Demonstration data already present

The demonstration seed creates categories marked "démo" (demo): "Intervention technique (démo
circuit B)" and "Petits travaux (démo photo)". They are present in the development
database, along with the shift category "Garde de classe" renamed "Garde surveillance" and the work
category "Surveillance" created on 2026-10-16. They are flagged here and have not been deleted.

Since 004, the seed also creates the system-key groups "Surveillants" (Supervisors) and "Enseignants" (Teachers),
two floors ("1er étage", "2e étage") with their classes and supervisors, and the accounts
`admin` ("Admin — surveillante générale", i.e. head supervisor), `surveillant`, `remplacant`, `surveillant2`.

## 1. Side menu

### 1.1 Menu entries

Roles: Employee (`EMPLOYEE`), Admin (`ADMIN`), Super administrator (`SUPER_ADMIN`). All
API routes require a valid session (global guard `SessionGuard`,
`backend/src/auth/auth.module.ts:27`).

| Entry | Route | Roles allowed | Actions available (super administrator) | Status |
| --- | --- | --- | --- | --- |
| Notification bell | panel (no route) | all | list, unread count badge, click that opens the request and marks it read, "Tout marquer comme lu" (Mark all as read) | Complete |
| Mes demandes (My requests) | `/` (tabs `?onglet=`) | all | tabs Reçues (Received), Envoyées (Sent), Brouillons (Drafts) (if any), À valider (To validate), Suivi (Tracking); search; filters; detail | Complete |
| Nouvelle demande (New request) | `/demandes/nouvelle`, `/demandes/:id/brouillon` | all (depending on categories) | creation in any active work request category; saving as a draft, resuming, sending and deleting a draft | Complete (drafts: spec 007) |
| Gardes (Shifts) | `/gardes`, `/gardes/nouvelle`, `/gardes/signaler`, `/gardes/classe-vide`, `/gardes/statistiques`, `/gardes/:id`, `/gardes/presence` | admins, super administrator, members of the Surveillants or Enseignants groups | tabs En attente (Pending), En cours (In progress), Doublons (Duplicates), Équipe (Team), Terminées (Completed); new assignment; statistics; actions on an assignment | Complete (see §3) |
| Administrateur (Administrator) | `/admin/*` | super administrator | 9 tabs (§2) | Complete |
| Profile block ("Mon profil") | `/profil` | all | name and role, link to "Mon profil": read-only account information, "Changer mon mot de passe" (Change my password) | Complete (spec 005) |
| Se déconnecter (Log out) | `POST /api/auth/logout` | all | end of session | Complete |

Detail per entry:

- **Bell** — component `frontend/src/features/notifications/NotificationCenter.tsx`; API
  `GET /api/notifications` and `POST /api/notifications/read`
  (`backend/src/notifications/notifications.controller.ts:42` and `:75`), limited to the
  notifications of the logged-in user. Server-side filtering for the super administrator, when
  each notification is created (`backend/src/notifications/super-admin-policy.ts:41`,
  applied in `notifications.service.ts`): on a work request of which they are neither the
  requester nor a recipient, they only receive the alerts "Demande urgente" (Urgent request), "Demande sans
  employé affecté" (Request with no assigned employee) (deadline soon exceeded, type `UNASSIGNED`) and "Demande en retard" (Request overdue), once
  per request and per type, plus the messages of an urgent or overdue request; nothing on a
  completed, refused or cancelled request. The "no assigned employee" and "overdue" alerts are
  raised by a scheduled task (`backend/src/scheduler/super-admin-alerts.job.ts`, every
  15 s at most). Assignments are not filtered; the super administrator also receives
  the escalation of an urgent unassigned assignment (setting `coverageEscalationMinutes`, §2.6).
  The panel shows the request reference (`D-AAAA-NNNNNN`, `NotificationCenter.tsx:145`),
  hidden elsewhere (§4).
- **Mes demandes** — `frontend/src/features/requests/RequestListPage.tsx`, API
  `GET /api/requests?scope=` (`backend/src/requests/requests.controller.ts:36`). Super
  administrator visibility: all work requests except other people's drafts
  (`backend/src/requests/domain/visibility.ts:19`).
  - "Reçues" (`scope=assigned`): **only the requests of which they are the assigned person**,
    not all requests.
  - "Envoyées" (`scope=mine`): their own requests, **without** their drafts.
  - "Brouillons" (`scope=drafts`, spec 007): their own drafts; the tab only appears
    if at least one exists. A draft opens on its resume page.
  - "À valider" (admins and super administrator, `RequestListPage.tsx:163`): requests
    awaiting administrative validation or final validation, all categories for the super
    administrator.
  - "Suivi" (admins and super administrator, `scope=all`): all visible requests.
  - Search in titles; filters Statut (Status), Priorité (Priority), Catégorie (Category), Destinataire (Recipient), Du/Au (From/To), "En
    retard uniquement" (Overdue only) (`RequestFilters.tsx`), kept in the URL.
  - Detail (`RequestDetailPage.tsx`, actions computed by the server in
    `backend/src/requests/domain/access-policy.ts`): depending on the category's routing mode.
    Via administration: approve or refuse (reason), reassign, change priority, validate
    or send back for correction at final validation, write in the discussion. Direct and between
    teachers: **read-only** (no action, no writing). Cancel: only on their
    own requests, before acceptance. Discussion (text, voice message, photo, PDF): if
    writing is allowed. Completed request: read-only, with no countdown.
- **Nouvelle demande** — `frontend/src/features/requests/CreateRequestPage.tsx`, API
  `GET /api/categories` then `POST /api/requests`. Categories offered to the super administrator:
  all active **work request** categories, whatever their allowed roles
  (`access-policy.ts`, `canCreateInCategory`). Shift categories never appear there (assignments
  are created from Gardes). Fields: category, recipient (direct mode: department
  preselected if it is the only one; between teachers: colleague to choose; via administration:
  none), priority, title, voice message, description (either of the two is enough). No attachment
  at creation.
  - **Drafts** (spec 007, if the "Brouillons de demande autorisés" (Request drafts allowed) setting is on):
    "Enregistrer en brouillon" (Save as draft) (category and title are enough, priority "Normale" (Normal) by default);
    nothing is sent or notified, the draft is visible only to its author. Resuming on
    `/demandes/:id/brouillon` (`DraftPage.tsx`): pre-filled form, voice message to
    listen to again, replace or delete; "Enregistrer le brouillon" (Save the draft) (`PATCH /api/requests/:id`),
    "Envoyer la demande" (Send the request) (action `SUBMIT`, same rules as a direct creation),
    "Supprimer le brouillon" (Delete the draft) after confirmation (`DELETE /api/requests/:id`). Setting off:
    no new draft, existing drafts remain usable.
- **Gardes** — `frontend/src/features/coverage/CoveragePage.tsx`; API `/api/coverage/*`
  (`backend/src/coverage/coverage.controller.ts`). Menu displayed for admins, the super
  administrator and members of the Surveillants or Enseignants groups (`AppLayout.tsx:55`).
  Tabs depending on the profile: admins and super administrator (`isCoverageAdmin`,
  `backend/src/coverage/domain/coverage-policy.ts:56`): En attente, En cours, Doublons, Équipe,
  Terminées; teacher: Mes signalements (My reports); supervisor: Mes affectations (My assignments), Historique (History). Difference
  from "Suivi des gardes" (Shift tracking): Gardes is for **acting** (assigning, creating, reassigning, cancelling…);
  "Suivi des gardes" (Administrateur) is for **supervising** (indicators, statistics per
  supervisor, CSV export), with no action.
- **Administrateur** — `frontend/src/features/admin/AdminLayout.tsx`; the entry is only added to the
  menu for the super administrator (`AppLayout.tsx:234`) and the page shows "Accès réservé" (Access restricted)
  to the others. Server protection: `SuperAdminGuard` (`backend/src/audit/super-admin.guard.ts`,
  rule `canManageAdministration`, `backend/src/common/authorization.ts:29`) on every
  `/api/admin/*` controller, with logged refusal (`ACCESS_DENIED`).
- **Profile and logout** — the profile block (name and role) is a link to "Mon profil"
  (`/profil`, `ProfilePage.tsx`, spec 005; `ProfileLink`, `AppLayout.tsx:181`): name,
  username, job title, role and assignment groups read-only (fields `username` and
  `jobTitle` of `GET /api/auth/me`), and "Changer mon mot de passe". Password change:
  route `/mot-de-passe` and `POST /api/auth/password`, forced at first login (with no
  cancel, then home) or voluntary from the profile ("Annuler" (Cancel), back to the profile with
  confirmation); it closes the other sessions (`backend/src/auth/auth.service.ts:76`). Logout: deletion of the session in the database and
  closing of real-time connections (`auth.service.ts:52-54`), logged (`LOGOUT`).

### 1.2 Menu visibility by role

| Entry | Employee | Admin | Super administrator |
| --- | --- | --- | --- |
| Bell | ✅ | ✅ | ✅ (filtered alerts) |
| Mes demandes: Reçues, Envoyées | ✅ | ✅ | ✅ |
| Mes demandes: À valider, Suivi | ❌ | ✅ | ✅ |
| Nouvelle demande | ✅ | ✅ (any category) | ✅ (any category) |
| Gardes | if member of the Surveillants or Enseignants group | ✅ | ✅ |
| Administrateur | ❌ | ❌ | ✅ |
| Profile block, Se déconnecter | ✅ | ✅ | ✅ |

### 1.3 Mobile and desktop

`AppLayout.tsx` changes layout from the `md` breakpoint (900 px):

- **desktop**: fixed sidebar (logo and bell, menu, profile block and "Se
  déconnecter" button at the bottom);
- **mobile**: top bar ("Ouvrir le menu" (Open the menu) button, logo, bell, logout icon);
  the menu opens in a side drawer.

## 2. Administrator, tab by tab

All the routes below are protected by `SuperAdminGuard` (controller indicated), except, since
feature 011, floors, levels, classes (with their QR codes) and students, protected by
`AdministrationGuard`: active admins manage them too, and get a read-only « Employés » tab
(`/admin/employes`, `/api/admin/employees`). See `specs/011-espace-admin-donnees-reference/`. Tabs:
Tableau de bord (Dashboard), Suivi des gardes, Comptes (Accounts), Catégories, Groupes, Étages (Floors), Classes, Réglages (Settings),
Journal d'audit (`AdminLayout.tsx:21-30`).

### 2.1 Tableau de bord (`/admin/tableau-de-bord`)

| Feature | File / endpoint | Authorization | Status |
| --- | --- | --- | --- |
| Filters: period (7, 30, 90 days or custom), category, priority, employee | `DashboardPage.tsx` | `dashboard.controller.ts:8` | Complete |
| "À traiter maintenant" (To handle now): overdue, urgent in progress, with no assigned employee, alerts with link | `GET /api/admin/dashboard/summary` | same | Complete |
| Counters per state, charts (breakdown, daily trend) with table view | same | same | Complete |
| Deadlines: first response (first message from someone other than the requester), pick-up, net and gross handling, compliance rate, per priority | `GET …/performance` | same | Complete |
| Activity per employee | `GET …/employees` | same | Complete |
| List of requests | `GET /api/requests?scope=all` | request visibility | Complete |
| Activity feed (metadata only) | `GET …/activity` | same | Complete |
| CSV export of the period's requests (same filters; metadata, dates and deadlines, without description or message) | `GET …/export.csv` | same | Complete |

Scope: work requests only; live refresh on every request update
(Socket.IO room of the super administrators) and every 60 s. The Employés tab also lists, at zero,
the active accounts with no request in the period.

### 2.2 Suivi des gardes (`/admin/suivi`, "Suivi des affectations" page)

| Feature | File / endpoint | Authorization | Status |
| --- | --- | --- | --- |
| Key figures: pending, assigned, in progress, overdue, delays, unfilled, handovers requested, assignments made | `CoverageDashboardPage.tsx`, `GET /api/admin/coverage/dashboard` | `coverage-admin.controller.ts:12` | Complete |
| Assignments in progress: class, status, assigned supervisor, duration | same | same | Complete |
| Per supervisor: availability, assignment in progress, statistics | same | same | Complete |
| Filters (supervisor, class, status, floor, From/To), CSV export and printing | `GET …/export.csv` (`CoverageDashboardPage.tsx:146`) | same | Complete |
| Supervisor absences | availability "Absent" (Gardes › Équipe) | same | Partial: no dedicated view |

Detailed statistics (per teacher, class or period, week or month): page
`/gardes/statistiques` (`CoverageStatsPage.tsx`), `GET /api/coverage/stats`
(`coverage.controller.ts`), admins and super administrator. CSV export of the displayed view
(spec 008): "Exporter en CSV" (Export as CSV), `GET /api/coverage/stats/export.csv`, same access and same
values as the page, every export logged.

### 2.3 Comptes (`/admin/comptes`)

| Feature | File / endpoint | Authorization | Status |
| --- | --- | --- | --- |
| List, creation (username, name, job title, role Employee / Admin / Super administrator, recipient categories) | `UsersAdminPage.tsx`, `UserFormDialog.tsx`, `GET`/`POST /api/admin/users` | `admin-users.controller.ts:11` | Complete |
| Modification, attachment to categories ("Destinataire : …" (Recipient: …)) | `PATCH /api/admin/users/:id` | same | Complete |
| Password reset: temporary password shown once, state "Mot de passe à changer" (Password to change) | `POST …/:id/reset-password` | same | Complete |
| Deactivation and reactivation (sessions closed on deactivation) | `PATCH …/:id` | same, `users.service.ts:208` | Complete |
| Server safeguards on their own account | `users.service.ts:154-157`, `:216-217` | server | Complete: a super administrator can neither deactivate themselves, nor remove their own role, nor reset their own password by direct request |

### 2.4 Catégories (`/admin/categories`)

| Feature | File / endpoint | Authorization | Status |
| --- | --- | --- | --- |
| Creation and modification: name, type (work request or shift, fixed at creation), routing mode (via administration, direct, between teachers), creator roles, closing, final validation, automatic assignment, proof photo | `CategoryFormDialog.tsx`, `POST`/`PATCH /api/admin/categories` | `admin-categories.controller.ts:11` | Complete |
| Recipients and "Admins de la catégorie" (Category admins) (Admin or Super administrator role only, `admin-categories.service.ts:232-237`) | `PUT …/:id/recipients`, `…/:id/managers` | same | Complete |
| Deadlines per priority | `PUT …/:id/deadlines` | same | Complete |
| Activation and deactivation | "active" checkbox of the form | same | Complete |
| Refreshing the "Nouvelle demande" form | list reloaded at every opening (`requests/api.ts`) | — | Complete |

### 2.4 bis Consignes (Guidelines) (`/admin/consignes`, feature 009)

| Feature | File / endpoint | Authorization | Status |
| --- | --- | --- | --- |
| List (title, scope "Générale" (General) or category, state, date and author of the modification) | `GuidelinesAdminPage.tsx`, `GET /api/admin/guidelines` | `SuperAdminGuard` (`admin-guidelines.controller.ts`) | Complete |
| Creation and modification: title (120), text (4,000), scope (general or work request category), active | `GuidelineFormDialog.tsx`, `POST`/`PATCH /api/admin/guidelines` | same | Complete |
| Activation, deactivation, confirmed deletion | `PATCH`/`DELETE /api/admin/guidelines/:id` | same | Complete |
| Audit log: "Consigne créée / modifiée / supprimée" (Guideline created / modified / deleted) + title, never the text | `GUIDELINE_CHANGED` | — | Complete |

Active guidelines are used for the **automatic suggestions** of the "Nouvelle
demande" form (category, priority, title), visible only to requesters allowed for the
category. Assistance is disabled by default (`ASSIST_*_PROVIDER=disabled`); the `demo`
provider is used for demonstrations, with no external call.

### 2.5 Groupes, Étages et Classes (`/admin/groupes`, `/admin/etages`, `/admin/classes`)

| Feature | File / endpoint | Authorization | Status |
| --- | --- | --- | --- |
| Groups: name, active, members; system-key groups "Surveillants" and "Enseignants" (renamable, never deactivated) | `GroupsAdminPage.tsx`, `/api/admin/coverage/groups` | `coverage-admin.controller.ts:12` | Complete |
| Floors: name, display order, active; warning if no supervisor is attached to it | `FloorsAdminPage.tsx`, `/api/admin/floors` | `coverage-admin.controller.ts:74` | Complete |
| Classes: name, room, floor (mandatory), active; printable and revocable QR code | `ClassesAdminPage.tsx`, `/api/admin/coverage/classes`, `…/qr`, `…/qr/revoke` | `coverage-admin.controller.ts:12` | Complete |

Usage: members of the **Surveillants** group can be assigned and declare an empty class;
those of the **Enseignants** group can report a delay or an absence; membership of either
makes the Gardes menu appear. Other groups have no effect on
assignments. **Floors** order the proposed supervisors (those of the class's floor
first); **classes** are the place of the assignment and carry the attendance-proof
QR code. None of this affects the routing or visibility of work requests.

### 2.6 Réglages (`/admin/reglages`)

| Setting | Default value | Status |
| --- | --- | --- |
| Maximum voice message length, maximum size | 180 s, 5 MB | Complete |
| Maximum attachment size, number per message | 10 MB, 5 | Complete |
| Accepted photo and document formats | JPEG, PNG, WebP; PDF | Complete |
| Request drafts allowed | yes | Complete (spec 007) |
| Alert threshold before due date | 20% | Complete |
| Inactivity and maximum session duration | 60 min, 12 h | Complete |
| Assignments: urgency threshold before slot start, escalation to the super administrator | 60 min, 5 min | Complete |
| Assignments: morning reminder, closing reminder then reminder to the admin | 07:00; 10 min, 10 min | Complete |
| Assignments: support reminders (interval, maximum number) | 10 min, 3 | Complete |
| Assignments: retention before anonymization | 12 months | Complete |
| Permissions per role (create, priority, reassign, audit…) | `GET`/`PUT /api/admin/role-permissions` | Complete |

Endpoints `GET`/`PUT /api/admin/settings` (`admin-settings.controller.ts:10`), default values
in `backend/src/settings/settings.service.ts:9-30`. Handling deadlines per priority are
set per category (§2.4), not here; the pick-up deadline of an assignment is that of
the shift category.

### 2.7 Journal d'audit (`/admin/journal`)

Read-only, filters by author, action and period (`admin-audit.controller.ts:57`).

| Event | Recorded | Source |
| --- | --- | --- |
| Successful or failed login, logout | ✅ | `auth.service.ts` |
| Access denied | ✅ | guards and services |
| Account created, modified (including role change and reactivation), deactivated | ✅ | `users.service.ts` |
| Password reset and change | ✅ | `users.service.ts`, `auth.service.ts` |
| Permissions, settings, categories, deadlines | ✅ | `admin-settings.service.ts`, `admin-categories.service.ts` |
| Groups, floors, classes, QR revocation, availability | ✅ | `coverage-admin.service.ts`, `coverage.service.ts` |
| Assignments: assignment, reassignment, release, validation, cancellation, teacher corrected, support released, **modification of the class or slot** (spec 006, `details.action = 'UPDATE'`, before and after, without the reason) ("Affectation gérée par un admin" (Assignment managed by an admin)) | ✅ `COVERAGE_MANAGED` | `coverage-actions.service.ts:71-79`, `coverage.service.ts` (`updateCoverage`) |
| Direct assignment ("Affectation créée" (Assignment created)) | ✅ `COVERAGE_CREATED` | `coverage.service.ts:441` |
| Decision on a possible duplicate | ✅ `COVERAGE_MERGE_DECIDED` | `coverage-declarations.service.ts` |
| Anonymization of old assignments (scheduled task) | ✅ `COVERAGE_ANONYMIZED` | `coverage-anonymization.service.ts:87` |
| Export of assignment statistics (period and grouping, without value or name; spec 008) | ✅ `COVERAGE_STATS_EXPORTED` | `coverage-stats.service.ts` (`exportCsv`) |
| Teacher report, declared empty class, supervisor actions (on the way, attendance, end) | ❌ by choice (assignment history) | `RequestEvent` |
| Work requests: approval, refusal, reassignment, cancellation, final validation, sent back for correction, priority change (reason flagged, without its text) | ✅ `REQUEST_MANAGED` | `request-transitions.service.ts:53`, `requests.service.ts` |
| Work requests: accept, start, finish, decline (routine employee actions) | ❌ by choice (request history) | `RequestEvent` |
| Role change as a distinct event | ❌ (included in "Compte modifié" (Account modified)) | — |

## 3. Supervisor assignment

| Question | Answer in the code |
| --- | --- |
| Who manages assignments | Admins and the super administrator (`isCoverageAdmin`, `coverage-policy.ts:56`). The seed's `admin` account plays the head supervisor. |
| Where an assignment comes from | Three sources: **teacher report** (delay or absence, `POST /api/coverage/teacher-requests`, "En attente" until assigned); **empty class** declared by a supervisor during their round (`POST /api/coverage/empty-class`, in their name and in progress); **direct assignment** by an admin (`POST /api/coverage`, `coverage.service.ts:327`, created assigned). |
| Who can be assigned | An active member of the Surveillants group, whatever their role (`isEligibleAssignee`, `coverage-policy.ts:61`). Proposed supervisors: those of the class's floor first, available first (`supervisorCandidates`, `coverage-availability.ts:94`). |
| Who assigns, reassigns, removes, modifies | The admin: `ASSIGN`, `REASSIGN`, `RELEASE_BY_MANAGER`, `RELEASE_SUPPORT` (support), `CANCEL`, `SET_TEACHER`, and **modification** of the class and slot (`PATCH /api/coverage/:id`, spec 006): class, date and times before attendance, end time only during attendance (`modifiableFields`, `domain/coverage-modification.ts`), status unchanged ("En route" included), availability re-checked with a refusal that names the conflicting assignment. The teacher modifies or withdraws their report as long as it is pending (`PATCH /api/coverage/:id/teacher-request`, `WITHDRAW`). |
| Replacing an absent supervisor | Availability "Absent" (Gardes › Équipe), then reassignment of their assignments by the admin. During the assignment: the supervisor requests a handover (`REQUEST_RELIEF`). |
| What the supervisor sees | Notification "Demande affectée" (Request assigned), tabs "Mes affectations" and "Historique", "Je suis en route" (I am on my way), attendance confirmation by the class QR code and photo (depending on the shift category), "Terminer" (Finish). The reason for the report is never shown to them (`canSeeReason`, `coverage-policy.ts:101`). |
| Duplicates | Empty class already handled: the second declarant becomes **support**; declaration close to an existing assignment: **attachment proposal** to be decided by the admin (Doublons tab, `coverage-declarations.service.ts:309-321`). |
| Deadlines | Report not assigned in time: reminder to admins, escalation to the super administrator, then "Non pourvue" (Unfilled) (`EXPIRE_UNFILLED`, `coverage-reminders.job.ts:101`). |
| Traceability | Audit log (§2.7); assignment history (`RequestEvent`), for example "Réassignée de … à …" (Reassigned from … to …). |
| Conflicts handled | Availability checked server-side (`availabilityFor`, `coverage-availability.ts:27`): deactivated account, absent, unavailable, already assigned on an overlapping slot or as support → `NOT_AVAILABLE` refusal (`coverage-state-machine.ts:167`); the interface disables these supervisors. Simultaneous double pick-up prevented by a per-employee lock (`lockEmployee`, `coverage-availability.ts:124`). |
| Conflicts not handled | No more forcing since 004: an unavailable supervisor cannot be assigned, even by the super administrator. |

## 4. Gaps

### 4.1 Interface and server

- No interface feature found without server protection: every action goes through
  a rule on the API side (global guards, `SuperAdminGuard`, access policies).
- The request reference is still displayed in the notifications panel although it is
  hidden in the detail and the list.

### 4.2 Missing actions

- Reassigning a work request in direct mode or between teachers: impossible by choice
  (read-only administration); only the via-administration mode allows it.
- Deleting an assignment: absent (reasoned cancellation instead). Modification of the
  class and slot by the admin has existed since spec 006 (§3).

### 4.3 Partial or unused features

- Supervisor absences: only through the "Absent" availability, with no dedicated view.

### 4.4 Demonstration scenarios (`demo/`)

| Scenario | Playable | Remark |
| --- | --- | --- |
| S01 Side menu | Yes | Profile block: link to "Mon profil" (spec 005). |
| S02 Notifications | Yes | "No assigned employee" and "overdue" request: deadlines simulated in the disposable database. |
| S03 Mes demandes | Yes | "Reçues" only shows the requests assigned to the super administrator; cancellation on their own request; priority change in via-administration mode. |
| S04 Nouvelle demande | Yes | "Surveillance" and "Photocopies" to be created in the fictitious data. |
| S05 Comptes | Yes | — |
| S06 Catégories | Yes | — |
| S07 Groupes et Classes | Yes | An employee added to the Surveillants group, a class on a floor, then a direct assignment. |
| S08 Réglages | Yes | Visible effect: alert threshold (orange countdown) or a category's deadline. |
| S09 Journal d'audit | Yes | Administrative actions on work requests and assignments logged; routine employee actions in the history only. |
| S10 Tableau de bord | Yes | — |
| S11 Suivi des gardes | Yes | Teacher report pending, assignment in progress, assignment cancelled. |
| S12 Supervisor assignment | Yes | Report assigned; supervisor already assigned not proposable; absent one replaced by reassignment. |
| S13 Supervisor view | Yes | Mobile viewport; notification and "Mes affectations" tab. |
