# Feature Specification: Teacher lateness and absences, supervisor assignment

**Feature Branch**: `004-retards-affectation-surveillants`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Evolution of the existing application: management of teacher
lateness/absences and assignment of supervisors. Continuity with what exists (reuse and adapt,
recreate nothing, break nothing). The "responsable" role becomes "admin" (general supervisor
/ administration), everywhere. Roles: admin (oversees, receives information, assigns
supervisors), supervisor (attached to a floor, 1 or 2 per floor, does rounds and watches
classes without a teacher), teacher (reports a lateness or absence in advance). Three journeys:
planned lateness/absence reported by the teacher for today or tomorrow; empty class detected by
the supervisor during their round; direct assignment created by the admin. Rules: three
assignment sources, a supervisor busy on the same time slot is not offered, statuses pending /
assigned / in progress / done / cancelled, history kept for consultation and statistics, only the
admin assigns and creates assignments. Include a current-state review (existing / to modify /
missing) and the ambiguous points as questions, with no assumptions."

## Method

- The current-state review below was established by reading the code of the
  `003-corrections-audit-technique` branch (2026-10-16). File references serve the plan; the
  requirements themselves stay functional.
- As requested, **no ambiguous point is settled by assumption**: each
  ambiguity was recorded in "Questions to clarify" (Q1 to Q21). All are
  settled as of 2026-10-16; the answers are authoritative in "Clarifications".
- Vocabulary: in this document, **"assignment"** (« affectation ») means that a supervisor watches
  a class with no teacher on a time slot. **"Guard duty"** (« Garde ») means the existing
  "Gardes" feature (class cover, phase 2). An assignment **is** an enriched guard duty (Q2).

## Clarifications

### Session 2026-10-16

- Q1: Meaning of the "responsable" → "admin" rename? → A: The "Responsable" role becomes
  "Admin" and keeps its current rights. "Super administrateur" and "Admin" stay two
  distinct roles.
- Q2: Relationship with the existing guard duties? → A: We enrich the existing guard duty (source,
  floor, teacher concerned). The broadcast with first-volunteer pick-up is removed: only the
  admin assigns a supervisor, who is notified of their assignment. The existing guard duty tests
  are adapted. Single exception: when a supervisor reports an empty class themselves
  (they are already on site), the assignment is created directly in their name, with the source
  "signalement surveillant" (supervisor report), and the admin is informed.
- Q3: Teacher and supervisor, roles or functions? → A: They stay employees,
  identified by a group ("Enseignants", "Surveillants"), reusing the existing groups. An
  employee can belong to several groups. A supervisor's attachment to a floor is an
  additional piece of their profile data.
- Q1 (continued): Super administrator, demo account, past specs, labels? → A: The super
  administrator (owner of the school) has all accesses and can play all roles in these
  journeys (Admin, Supervisor, Teacher: receive requests, assign, create
  assignments, etc.). The demo account `responsable` is renamed `admin` (identifier, display
  name, initialization data). Specifications 001 and 003 are not rewritten:
  we only add a note saying that "Responsable" has become "Admin", the
  terminology of the current specification prevailing. The "Administration" area is renamed
  "Administrateur"; the owner's role is displayed "Super administrateur"; in the
  interface, "Admin" never designates the owner.
- Q2 (continued): Fate of the guard duty mechanisms and of the guard duties in progress? → A:
  Presence by QR code or photo, extension, handover and deadlines are kept on the assignments
  with no change in behavior; only the way a guard duty is allocated changes (assignment by the
  admin instead of broadcast). Guard duties still open (being broadcast) at the time of the update
  are kept and appear for the admin as "en attente" (pending) so that she assigns a
  supervisor; guard duties already taken by a volunteer stay as they are.
- Q3 (continued): "Surveillants/Remplaçants" group? → A: It is renamed "Surveillants" (no
  new group), keeping the current members. If some members are not supervisors
  (substitutes), the case is flagged before the migration.
- Q2 (complements): Pick-up deadline and "Non pourvues" (unfilled) guard duties? → A: The
  pick-up deadline (2 minutes by default, adjustable) now measures the time left to the admin to
  assign a supervisor. It applies to requests with a near due date (lateness or absence planned
  for today); no deadline for an empty class reported by a supervisor (already "en
  cours" (in progress)); for a report concerning tomorrow, no short deadline but a reminder in the
  morning if nothing is assigned. At expiry, an alert is sent to the admin; with no reply, it
  is escalated to the super administrator; the request stays "en attente" and is shown
  first. During the update, the "Non pourvues" guard duties whose time slot has not passed
  go back to "en attente"; those whose time slot has passed stay "non pourvues" in the
  history (kept for the statistics).
- Q2 (settings): Reminder, escalation, distant time slot, "non pourvue" status? → A: The
  reminder goes out at 7:00 (adjustable time) on the day concerned, to the admin only, and
  only if the request is still "en attente". The expiry alert is escalated to the super
  administrator if the admin has not replied 5 minutes later (adjustable duration); only
  the assignment of a supervisor, the refusal or the cancellation of the request by the admin
  count as a reply (having seen the alert is not enough) — *the refusal has since been removed, see the
  correction below*. The 2-minute deadline applies only if the start
  of the time slot is less than 60 minutes away (adjustable threshold); for a more distant time slot, the
  request stays "en attente" and the deadline starts when the time slot goes under the threshold, with the
  same alert and the same escalation; if the time slot has already started, the deadline applies
  immediately. "Non pourvue" is a sixth, final status, set when the time slot has passed
  without any supervisor being assigned; it is distinct from "annulée" (cancelled) (decision of
  the admin or the teacher) in the statistics.
- ~~Q2 (refusal): distinct "refusée" status~~ — *cancelled by the correction below.*
- Correction (refusal removed): What actions on a request? → A: There is no refusal
  (no "refusée" status, no reason, no refusal notification); six statuses: en attente,
  assignée, en cours, terminée, annulée, non pourvue. "En attente" = request received, no
  supervisor assigned; the action of the admin (or the super administrator) is to assign a
  supervisor. Once "assignée" (assigned), the admin (or the super administrator) can only
  cancel, optional reason (e.g. the teacher finally arrives on time); the assigned supervisor
  is then notified that their assignment is lifted. The assigned supervisor can neither
  accept, nor refuse, nor cancel: the assignment is an order; they only update
  the progress ("en cours", then "terminée"). A request never assigned becomes "non
  pourvue" when the time slot has passed. The escalation stops only by assignment (or
  cancellation, if it is allowed before assignment).
- Cancellation before assignment (FR-008b) → A: Option 1. On a request "en attente",
  the admin (or the super administrator) can assign a supervisor or cancel the request (optional
  reason) — this is not a refusal, it is the end of the request, which becomes "annulée".
  The requesting teacher can withdraw their own request as long as it is not assigned
  ("annulée", optional reason). The escalation stops as soon as the request is assigned or cancelled.
- Q12 (complements) → A: The teacher can modify their report (date, time slot, class,
  reason) as long as it is "en attente"; each modification is traced in the history. Once
  assigned, they no longer modify it: they warn the admin, who cancels or reassigns. An empty class
  reported by mistake (assignment "en cours") can only be cancelled by the admin (or the
  super administrator), optional reason; the supervisor can only warn the admin. A
  cancelled assignment does not count as an actual lateness in the statistics: it is
  counted separately under "annulée".
- Reassignment (Q12, continued) → A: On an "assignée" assignment, the admin (or the super
  administrator) can cancel it (optional reason) or reassign it to another available
  supervisor; only the admin decides. The former supervisor is notified that their assignment is
  lifted, the new one receives the order, the status stays "assignée", and the change is traced
  (who, when, former and new supervisor). On an "en cours" assignment, the admin can
  also reassign (e.g. free a supervisor who reported an empty class): it stays "en
  cours", the new supervisor is notified, and the original supervisor is released only once
  the new one is present in the class, confirmed by the existing handover mechanism.
  Cancelling an "en cours" assignment stays reserved to the admin. The existing reassignment
  of guard duties is kept, but only the admin can trigger it.
- Q9 (teacher concerned) → A: The supervisor is not required to indicate the teacher; the
  report is never blocked by this field. The application pre-fills the expected teacher
  from the timetable (class + time slot); the supervisor confirms it with one gesture, corrects
  it or leaves it empty. Without a timetable for this class and this time slot, the field stays
  empty and optional. If the teacher is filled in, they are identified for the statistics;
  otherwise the assignment is counted "classe sans enseignant, enseignant non précisé" (class
  without teacher, teacher not specified). The admin can complete or correct the teacher afterwards, each correction being
  traced. If the identified teacher had already reported a lateness for this time slot, the report is
  attached to their existing request to avoid a duplicate (see Q13).
- Timetable → A: Postponed to a later phase; this feature creates none. The
  teacher field of an empty-class report is optional and empty by default; the
  supervisor chooses from the list of teachers ("Enseignants" group) or leaves it empty;
  no pre-fill for now, but the field must allow adding it later without a
  redesign.
- Q5 (time slot) → A: Free range, no fixed grid: the requester enters the date, the start
  time and the end time (or a duration).
- Q6 (teacher's classes) → A: The teacher chooses among all the classes of the school,
  with no restriction; there is no teacher-class link for now.
- FR-015d (attachment) → A: Without a timetable, automatic attachment is based on the
  teacher, the class and an overlap of time range. If a matching request
  exists and is not yet assigned, the report attaches to it: the assignment goes "en
  cours" with the reporting supervisor, with no duplication.
- Q13 (duplicates) → A: Matching request already "assignée" to another supervisor:
  the assignment is kept with its supervisor, who stays responsible; the reporter is
  informed of who is assigned; the admin is notified to decide (reassign or leave); nothing
  is modified automatically. Matching request already "en cours": the report is
  attached to the existing assignment, with no new assignment; the supervisor present stays
  responsible; the admin is informed. Two supervisors report the same class: the first
  creates the "en cours" assignment; the second is attached to it and informed that the class is already
  taken care of; no second assignment; the admin decides whether they stay as backup or resume
  their round. Teacher not specified but an existing request on the same class and an overlapping
  range: no automatic attachment; the application proposes the attachment to the admin,
  who confirms or refuses; as long as she has not confirmed, the supervisor's assignment stays
  distinct; every merge is traced.
- Q13 (backup and statistics) → A: A supervisor on backup is "busy" as long as they are
  in the class (not offered elsewhere); they become available again as soon as the admin releases them, or
  automatically when the assignment becomes "terminée"; with no decision from the admin after
  10 minutes (adjustable duration), a reminder is sent to her. If the admin refuses a proposed
  attachment, the two assignments stay distinct and each counts as one event.
  As long as a proposal is pending, the two assignments are marked "doublon
  possible" (possible duplicate) and count only once; the final count takes place at the decision (confirmed:
  one event; refused: two). The proposal stays visible to the admin until a decision; if
  the two assignments are done without a decision, it is presented to her one last time.
  Every decision is traced.
- Q13 (last points) → A: If the admin does not decide after the last presentation, the two
  assignments stay counted only once, with the mention "non tranché" (undecided); the admin (or the
  super administrator) can decide at any time, including after the fact; the count is then
  corrected and the correction traced; the statistics distinguish the "non tranchés"
  duplicates from the final figures. The "backup" reminder is repeated every 10 minutes (adjustable)
  as long as the admin has not decided, within a limit of 3 reminders (adjustable cap); after the
  last one, the alert is forwarded to the super administrator; with no decision, the backup stays
  busy until the assignment becomes "terminée", then is released automatically.
- Q7 (floors) → A: A supervisor is attached to a single floor (field of their profile); each
  class belongs to a floor. For a class, the supervisors of its floor are offered
  first; the admin (or the super administrator) can assign a supervisor from another floor.
- Q8 (availability) → A: A supervisor is available if they have no active assignment
  (assignée or en cours) whose range overlaps the requested range; the backup counts as
  busy. Sorted list: supervisors of the class's floor first, then the others. No
  management of supervisors' leave or absences in this phase.
- Q10 (end of an assignment) → A: An assignment ends when the supervisor marks it
  "terminée". A request never assigned whose time slot has passed becomes "non pourvue".
  An assigned or in-progress assignment whose time slot is over with no closure triggers a reminder
  to the supervisor, then to the admin if it stays unanswered.
- Q11 (reporting deadlines) → A: Today or tomorrow only, never for a range already
  entirely past; no minimum notice (a last-minute report is accepted).
- Q14 (notifications) → A: In-app notification for all the module's events;
  highlighted alert (sound or visual) for urgent cases: empty class reported,
  deadline expiry, escalation. External channels (SMS, email) out of scope unless they already
  exist — checked in the code: none exists (no email, no SMS, no push notification).
- Q15 (statistics) → A: Accessible to the admin and the super administrator: number of latenesses
  per teacher, per class, per period, average duration, "non pourvue" rate. The
  "annulées" and the "undecided duplicates" are counted separately. Export out of scope.
- Q16 (GDPR) → A: Per-teacher statistics are personal data, reserved to
  the admin and the super administrator. A teacher only sees their own requests. Retention
  duration: one school year (adjustable), to be validated with management; beyond that, the
  data is deleted or anonymized.
- Q17 (duration) → A: Measured from the switch to "en cours" until "terminée"; for an empty class
  reported, it starts at the report.
- Q18 (access) → A: Other employees see nothing of this module; only the admin,
  the super administrator, the supervisor (their assignments) and the teacher (their requests) have access.
- Q19 (floor round) → A: Out of scope: no route, clocking or round tracking; the
  supervisor only reports an empty class when they find one.
- Q20 (media) → A: The existing application, no new medium; the changes
  apply to all existing media — checked in the code: a single responsive web
  application (no native mobile app nor installable app), usable on
  smartphone, tablet and computer.
- Q16 (GDPR and audit) → A: Anonymization, never deletion of the audit log. After one
  school year (adjustable), the teacher and the reason are anonymized in the module's data;
  the events (date, class, duration, status) remain for the overall statistics. The audit
  log is excluded from the purge and stays non-modifiable (constitution, principle V). The
  supervisor sees the class, the time slot and a short reason, but not the detailed reason entered
  by the teacher, reserved to the admin and the super administrator.
- Q21 (busy supervisor who finds an empty class) → A: The assignment is created anyway in
  their name, "en cours", because they cannot leave the students without an adult; they then have two
  active overlapping assignments, a case allowed only for this exception. The admin
  is alerted immediately (highlighted alert) to send another supervisor; she
  reassigns one or the other of the two assignments. Everything is traced.
- Q18 (scope of the admins) → A: All the admins (former managers) have access to the module,
  with no restriction by guard category; the current rule tied to the broadcast goes away.
- Q8 (declared availability) → A: The existing declared availability is still taken into account:
  a supervisor "Indisponible" (unavailable) or "Absent" is not offered, in addition to the overlap
  rule on assignments.
- Q7 (floor management) → A: The super administrator creates the floors and attaches the
  classes to them; the admin does not modify this structure. Floor without a supervisor: a simple
  warning, with no blocking (supervisors of other floors stay assignable). No
  upper limit on the number of supervisors per floor.
- Q10 (closing reminders) → A: Reminder to the supervisor 10 minutes after the end of the time slot
  (adjustable), then escalation to the admin after 10 more minutes with no reply (adjustable).
- Plan decisions validated (R3, R10, R11) → A: An earlier guard duty with no end time has as its
  deemed end the end of the local day (no closing reminder before). An empty-class report does
  not require proof of presence; a scanned QR code is recorded if
  provided. With no active admin, the notifications meant for the admins go to the super
  administrators (guard duties and assignments only, see Q23); the teacher author is notified
  when a supervisor is assigned to their request
  (FR-017a).
- Q16 (short reason) → A: The "short reason" is only the type of report:
  lateness, absence or empty class; the teacher enters no additional text. The
  assigned supervisor sees the class, the floor, the time slot and the type, never the detailed reason,
  reserved to the admin and the super administrator. For a direct assignment, the type is chosen
  by the admin; for an empty class reported by a supervisor, the type is "classe vide" (empty class).
- Q5 (absence of a whole day) → A: Absence management is postponed to a later
  phase. Here, a request concerns a single class and a single time range; a
  teacher absent for several hours or for several classes creates one request per class and
  per range (or the admin creates the assignments directly). Each request results in the
  assignment of a supervisor. The model must allow grouping several
  requests under one absence later without a redesign.
- Q4: Relationship with the current guard duty states? → A: Two levels: the main status
  (the six) and a sub-state displayed as a badge, which does not change the main status. Sub-states
  kept: "En route" and "En retard" under "assignée"; "Relève demandée" under "en
  cours"; "Clôturée après validation" under "terminée". Filters, statistics and alerts
  are based on the main status. Old finished guard duties are migrated to "terminée",
  their old label kept as a sub-state; no history data is deleted or
  rewritten. A check before migration flags any old status with no obvious equivalent.
- Q9: Initial status of an assignment created by an empty-class report? → A: It starts
  directly "en cours" (the supervisor is already in the class) and becomes "terminée" when
  the teacher arrives.

### Session 2026-10-16 (updated after the merge of PRs #6, #7 and #9)

This specification was written before three changes now in `master` (`59f70fb`):
finished request in read-only mode (PR #6), super administrator notifications (PR #7), routing
mode per category (PR #9). The answers below are authoritative and take precedence over older passages that would
contradict them.

- Q22 (admin rights on work requests) → A: The admin's (ex-manager's) rights
  on work requests follow the category's routing mode, and no longer "exactly
  the manager's rights". Via administration: the admins responsible for the category
  validate or refuse (reason required), assign, reassign, change the priority and write
  in the discussion. Direct and peer-to-peer: all admins view in read-only mode
  (no action, no message, no notification, delays included). In all modes, an
  admin can create a request in any active category.
- Q23 (fallback of notifications to the super administrator) → A: The fallback "with no active admin,
  the admins' notifications go to the super administrators" applies only to guard duties
  and supervisor assignments. On work requests, the super administrator is only notified
  of urgent requests, with no assigned employee (deadline soon exceeded) or delayed, once per
  request and per type, and never on a finished request (PR #7).
- Q24 (non-regression reference) → A: The `master` test suite after PR #9 serves as the
  reference: the adaptations made by PRs #6, #7 and #9 (read-only finished requests,
  super administrator notifications, routing) are not regressions.

## Current state

> Established on 2026-10-16 on branch 003; completed the same day after the merge of PRs #6, #7 and
> #9 (rows "Demandes de travail" (Work requests), "Notifications" and "Droits" (Rights)).

### What already exists

| Area | Existing state observed | Where |
| --- | --- | --- |
| Roles | Three technical roles: `SUPER_ADMIN` ("Super administrateur"), `MANAGER` (displayed "Responsable"), `EMPLOYEE` ("Employé"). No "teacher" or "supervisor" role: they are employees, distinguished by a free job title and, for supervisors, by membership in a group. | `backend/prisma/schema.prisma:15-19`, `frontend/src/features/admin/labels.ts:4-8` |
| Demo accounts | `superadmin`, `responsable` ("Responsable administratif"), `enseignante`, `surveillant`, `remplacant`, etc. | `backend/prisma/seed.ts:27-38`, `e2e/support/accounts.ts` |
| Guard duties (class cover, phase 2) | A manager or the super administrator creates a guard duty request: class, targeted groups, start time, duration (or "jusqu'à l'arrivée de l'enseignant" (until the teacher arrives)), name of the absent teacher **as free text**, note, voice message. The guard duty is broadcast to the available members of the targeted groups (e.g. "Surveillants/Remplaçants"); **the first one to accept takes it**. The manager can also assign, reassign, widen, release, validate, cancel. The assigned supervisor departs, confirms their presence by QR code and/or photo, can extend, request a handover, be relieved. Tracked deadlines (pick-up 2 min, arrival 5 min) with automatic switch to "Non pourvue" / "En retard". | `backend/src/coverage/`, `frontend/src/features/coverage/`, `docs/coverage-migration.md` |
| Guard duty statuses | Diffusée (broadcast), Acceptée (accepted), En route, En retard, En poste (on duty), Relève demandée, Non pourvue, Terminée, Clôturée (closed), Annulée. | `RequestStatus` in `schema.prisma`, `coverage-state-machine.ts` |
| Availability | Each employee has an availability (Disponible / Indisponible / Absent — Absent reserved to managers). An employee already committed to an overlapping guard duty is not offered. | `backend/src/coverage/coverage-availability.ts` |
| Classes | List of classes (name, room as free text, active, printable revocable QR code), managed by the super administrator. **No floor.** | `SchoolClass` model, `/admin/classes` screen |
| Employee groups | Groups (e.g. "Surveillants/Remplaçants") managed by the super administrator, targeted by the guard duties. | `EmployeeGroup`, `/admin/groupes` screen |
| Notifications | In-app only, in real time (no push, no email — explicit choice of phase 1). Each notification is attached to a request. Guard duty types: new, taken, accepted, presence, released, handover requested, late, unfilled, extended, relieved. The managers of the guard category, the requester and, for some events, all the super administrators are notified. Work requests (PR #7): the super administrator is notified only of urgent requests, with no assigned employee or delayed, once per request and per type (server-side filter, scheduled alerts); guard duties are not concerned. | `backend/src/notifications/`, `backend/src/notifications/super-admin-policy.ts`, `frontend/src/features/notifications/` |
| Work requests (routing, PR #9) | Each category has a routing mode: via administration (validation by the category's managers, then assignment), direct (to the department, sole recipient chosen automatically) or peer-to-peer (to a chosen colleague, absence flagged without blocking). In direct and peer-to-peer modes, the managers and the super administrator view in read-only mode, with no notification; "Suivi" (follow-up) tab of the list. A finished, refused or cancelled request is read-only (PR #6). | `Category.routingMode`, `backend/src/requests/domain/access-policy.ts`, `visibility.ts` |
| History and follow-up | Non-modifiable history of each request, non-modifiable audit log, guard duty follow-up table and CSV export (durations included), "mes gardes" (my guard duties) history on the employee side. | `RequestEvent`, `AuditLog`, `/admin/suivi` |
| Rights | Server-side check: guard duty management open to the super administrator and to the managers of a guard category; administration (accounts, categories, classes, groups, settings, log) reserved to the super administrator. Work requests: managers' rights according to the routing mode (Q22); a manager can create in any active category. | `coverage-policy.ts`, `access-policy.ts`, `SuperAdminGuard` |
| Screens | `/gardes`: tabs En cours / Équipe / Terminées for managers; À prendre / Ma garde / Historique for group members; `/gardes/nouvelle`; `/gardes/:id`; `/gardes/presence` (QR). "Gardes" menu visible to group members and managers, "Administration" only to the super administrator. | `frontend/src/app/routes.tsx`, `AppLayout.tsx` |

### What must be modified

| Item | Gap with the need |
| --- | --- |
| "Responsable" label and role | Becomes "Admin" everywhere (data, rights, interface, texts), with the same rights (on work requests: those of the routing mode, Q22); texts added since that must also be renamed: "Suivi" tab, routing modes in the category administration, Employees tab of the dashboard; "Super administrateur" stays distinct (Q1). The word "admin" already designates today the **super administrator's** area ("Administration" menu, `/admin/*` screens): this area is renamed "Administrateur" and "Admin" never designates the owner. The demo account `responsable` becomes `admin`; specifications 001 and 003 only receive a note. The term appears **415 times in 82 files** (count of 2026-10-16 on `master` after PR #11, excluding specifications) (code, error messages, demo account `responsable`, tests, documentation, specifications 001 and 003). |
| Guard duty creation | Today reserved to managers; it will also have to be able to originate from a teacher request or a supervisor report (Q2). |
| Allocation mode | Today, broadcast to a group and **pick-up by the first volunteer**; this broadcast is removed: only the admin assigns, except an empty-class report assigned to the reporter (Q2). The existing reassignment is kept, but only the admin can trigger it. The existing guard duty tests are adapted. |
| Groups and profile | Create or reuse the "Enseignants" and "Surveillants" groups (the current group is "Surveillants/Remplaçants"); add the floor to the supervisor's profile (Q3). |
| Statuses | Six main statuses (en attente, assignée, en cours, terminée, annulée, non pourvue) replace the ten guard duty statuses; some current states become sub-states displayed as a badge (Q4). |
| Absent teacher | Today a free-text name; must become an identified employee, member of the "Enseignants" group (who reports, who arrives, per-teacher statistics). |
| Availability | Computed on overlapping guard duties; the notion of "time slot" and the handling of the floor round remain to be specified (Q5, Q8). |
| Notifications | Targets to review: "the admin" in place of the category managers; new events (teacher report, empty class). |

### What is missing

- A way for the teacher to **report in advance** a lateness or absence (today or
  tomorrow) and to follow its handling.
- A way for the supervisor to **report an empty class** during their round and to close the
  incident when the teacher arrives.
- The notion of **floor**: floors, attachment of classes to a floor, attachment of 1 or 2
  supervisors to a floor.
- Entry of a **time range** (date, start, end or duration) on a report; no
  timetable is created (postponed to a later phase).
- **Identification of the teacher** concerned (member of the "Enseignants" group); no
  teacher ↔ classes link for now.
- The **source** of an assignment (teacher request, supervisor report, direct creation).
- The **lateness / absence** distinction and the optional **reason**.
- **Statistics on latenesses and absences** (Q15).

## Questions to clarify

All the questions are settled; this section is kept for traceability.

### Roles and renaming

- **Q1 — Meaning of the rename**: *settled (see Clarifications).*
- **Q2 — Relationship with the existing "Gardes"**: *settled (see Clarifications).*
- **Q3 — Teacher and supervisor**: *settled (see Clarifications).*

### Reference data

- **Q4 — Statuses**: *settled (see Clarifications).*
- **Q5 — Time slot**: *settled (see Clarifications)*.
- **Q6 — Teacher's classes**: *settled (all classes, see Clarifications)*.
- **Q7 — Floors**: *settled (see Clarifications)*.

### Journey rules

- **Q8 — Availability**: *settled (see Clarifications)*.
- **Q9 — Empty-class report (source 2)**: the assignment is created in the reporter's name
  and starts "en cours", and the admin can reassign it; the teacher is optional, chosen
  from the "Enseignants" group, with no pre-fill as long as no timetable exists
  (Clarifications). *Settled.*
- **Q10 — End of an assignment**: *settled (see Clarifications)*.
- **Q11 — Reporting deadline**: *settled (see Clarifications)*.
- **Q12 — Cancellation and modification**: *settled (see Clarifications)*.
- **Q13 — Duplicates**: *settled (see Clarifications)*.

### Notifications, history, statistics

- **Q14 — Notifications**: *settled (see Clarifications)*.
- **Q15 — Statistics**: *settled (see Clarifications)*.
- **Q16 — Retention and confidentiality (GDPR)**: *settled (see Clarifications)*.
- **Q17 — Duration**: *settled (see Clarifications)*.

### Compatibility

- **Q18 — Access of other employees**: *settled (see Clarifications)*.
- **Q19 — Floor round**: *settled (out of scope, see Clarifications)*.
- **Q20 — Media**: *settled (see Clarifications)*.
- **Q21 — Supervisor already assigned who finds an empty class**: *settled (see Clarifications)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Report a lateness or absence in advance (Priority: P1)

A teacher knows she will arrive late tomorrow morning. From the application, she reports
a lateness for tomorrow, specifying the time slot, the class and, if she wishes, a reason. She
sees her report "en attente". The admin is notified, looks at the supervisors available
on that time slot and assigns one. The supervisor is notified of their assignment (class, time slot);
the report becomes "assignée". On the day, the supervisor takes the class ("en cours"),
then closes when the teacher arrives ("terminée").

**Why this priority**: it is the new journey of highest value: it makes it possible to anticipate and
to avoid a class being left without an adult. It lays the building blocks reused by the other journeys
(assignment, availability, statuses, notifications).

**Independent Test**: a teacher account reports a lateness for the next day; an admin account
sees the report and assigns an available supervisor; the supervisor account sees their
assignment; the closure records the history. Testable without stories 2 and 3.

**Acceptance Scenarios**:

1. **Given** a logged-in teacher, **When** they report a lateness for today or tomorrow with
   date, time slot and class (empty reason), **Then** the report is recorded "en attente",
   timestamped, with the source "demande enseignant" (teacher request), and the admin is notified in real time.
2. **Given** a report without date, time slot or class, **When** the teacher tries to
   send it, **Then** sending is blocked and each missing field is clearly flagged.
3. **Given** a date other than today or tomorrow, **When** the teacher tries to send it,
   **Then** sending is refused with a message explaining the rule (FR-012).
4. **Given** a report "en attente", **When** the admin opens the list of supervisors
   available for this time slot, **Then** no supervisor already assigned on an
   overlapping time slot appears in it.
5. **Given** a report "en attente", **When** the admin assigns an available supervisor,
   **Then** the status becomes "assignée", the supervisor is notified of the class and the time slot,
   and the action is traced (who, when).
6. **Given** an "assignée" assignment, **When** the supervisor takes the class then closes it
   when the teacher arrives, **Then** the statuses become "en cours" then "terminée", and
   the history keeps who, when, which class and the duration (duration: FR-021).
7. **Given** a teacher or a supervisor, **When** they try to assign a supervisor,
   **Then** the action is refused and the refusal is logged.

---

### User Story 2 - Report an empty class during the round (Priority: P1)

During their floor round, a supervisor finds a class with no teacher. They report it in
the application (class, and current time slot), stay with the students, and the admin is informed
immediately. When the teacher arrives, the supervisor closes the incident and resumes their round.

**Why this priority**: it is the most frequent and most urgent situation (students without an
adult); it does not depend on a prior report by the teacher.

**Independent Test**: a supervisor account reports an empty class; the admin account receives
the information in real time; the supervisor closes; the history is complete. Testable without
stories 1 and 3.

**Acceptance Scenarios**:

1. **Given** a logged-in supervisor, **When** they report an empty class, **Then** an
   assignment is created in their name, with no admin intervention, with the source "signalement
   surveillant" (supervisor report), timestamped, and the admin is notified in real time; the assignment starts directly "en cours".
2. **Given** an incident opened by a supervisor, **When** the teacher arrives and the
   supervisor closes the incident, **Then** the status becomes "terminée", the closing time is
   recorded and the supervisor becomes available again.
3. **Given** a supervisor already assigned to another class on this time slot, **When** they report an
   empty class, **Then** the assignment is created anyway in their name, "en cours", and the admin
   immediately receives a highlighted alert to reassign one of the two assignments
   (FR-015j).
4. **Given** a class already covered by an in-progress assignment on this time slot, **When** a
   supervisor reports it empty, **Then** the report is attached to the existing assignment, without creating a second one, and the admin is informed (FR-015f).

---

### User Story 3 - Create a direct assignment (Priority: P2)

A teacher phones the administration to give notice of their absence. The admin creates the
assignment herself (class, time slot, available supervisor), with no prior request in
the application. The supervisor is notified.

**Why this priority**: it covers cases outside the application; the existing system already partly allows
creating a guard duty, which reduces the effort.

**Independent Test**: an admin account creates a direct assignment; the chosen supervisor
receives it; it appears in the history with the source "création directe" (direct creation).

**Acceptance Scenarios**:

1. **Given** the logged-in admin, **When** she creates an assignment by choosing class, time slot
   and an available supervisor, **Then** the assignment is created "assignée" with the source
   "création directe", and the supervisor is notified.
2. **Given** a supervisor already assigned on an overlapping time slot, **When** the admin creates an
   assignment, **Then** this supervisor is not offered to her.
3. **Given** a teacher or a supervisor, **When** they try to create a direct assignment,
   **Then** the action is refused and the refusal is logged.

---

### User Story 4 - "Admin" role in place of "responsable" (Priority: P1)

Everywhere the application displays, checks or documents the "responsable" role, it now uses
"admin", without any current user losing an access or a piece of data.

**Why this priority**: the three journeys are addressed to "the admin"; the rename conditions
the rights and the texts of the whole feature.

**Independent Test**: after the update, a user who was previously "responsable" logs in,
sees the "admin" label and regains all their accesses and requests; no interface text
uses "responsable" in the sense of the role any more.

**Acceptance Scenarios**:

1. **Given** an existing "responsable" account, **When** the update is applied, **Then**
   it becomes "admin" and keeps its requests, its categories and its history.
2. **Given** any screen or message, **When** it designates this role, **Then** it uses
   "Admin", and the "Super administrateur" role stays distinct and unchanged in its rights.
3. **Given** an admin (ex-manager), **When** they use work requests, **Then** they
   have the rights that the routing mode gives to the administration (Q22): via
   administration, validation, assignment, reassignment, priority and discussion in the
   categories they manage; direct and peer-to-peer, read-only view of all
   requests, with no notification; creation possible in any active category.
4. **Given** the existing journeys (work requests according to their routing mode, guard duties,
   administration), **When** they are replayed after the update, **Then** they behave
   as in `master` after PR #9 (Q24), apart from the intended change in guard duty allocation
   (FR-011a).

---

### User Story 5 - View the history and statistics (Priority: P3)

The admin views the history of assignments (who, when, which class, duration, source) and
statistics on latenesses and absences.

**Why this priority**: useful for management, but not necessary to cover classes on a
day-to-day basis.

**Independent Test**: after several finished assignments, the admin filters the history and
gets figures consistent with the data entered.

**Acceptance Scenarios**:

1. **Given** finished and cancelled assignments, **When** the admin views the history,
   **Then** she sees for each one the teacher concerned, the class, the time slot, the supervisor,
   the source, the successive statuses with their authors and times, and the duration.
2. **Given** the history, **When** the admin views the statistics, **Then** she gets the
   indicators defined in FR-022, with the cancelled ones and the "non tranchés" duplicates shown separately.

---

### Edge Cases

- No supervisor available on the time slot: the request stays "en attente", alert and escalation (FR-011d, FR-011e), then "non pourvue" (FR-008a).
- Report for a range already started (accepted, immediate deadline: FR-011d) or entirely past (refused: FR-012).
- Teacher who reports then finally arrives on time: they withdraw their request if it is "en attente" (FR-008g), otherwise the admin cancels it (FR-008e).
- Same class reported by the teacher and reported empty by a supervisor (FR-015d to FR-015h).
- Assigned supervisor who becomes unavailable or absent after the assignment.
- Supervisor who forgets to close the assignment: reminder to the supervisor then to the admin (FR-016a).
- "En attente" assignment never assigned: "non pourvue" once the time slot has passed (FR-008a).
- Loss of connection when sending a report or a declaration (the existing system keeps the input
  and allows retrying for work requests).
- Class deactivated or supervisor deactivated while an assignment is in progress.
- Change of a user's role while they have assignments in progress.

## Requirements *(mandatory)*

### Functional Requirements

#### Continuity

- **FR-001**: The system MUST reuse the existing classes, groups, availabilities, real-time
  notifications, non-modifiable history and audit log instead of creating
  new equivalents.
- **FR-002**: All existing features (voice work requests and their routing
  modes — via administration, direct, peer-to-peer —, read-only finished
  requests, messaging, deadlines, super administrator notifications, guard duties, administration)
  MUST keep working; the `master` test suite after PR #9 (Q24) MUST stay
  green, adapted only for the role rename and for the removal of the guard duty
  broadcast (FR-011a).
- **FR-003**: The update MUST keep all existing data (accounts, requests,
  guard duties, histories).

#### Roles

- **FR-004**: The "Responsable" role MUST be renamed "Admin" in the data, the rights, the
  interface, the messages and the documentation, keeping exactly its current rights; the
  "Super administrateur" role MUST stay distinct; in the interface, "Admin" MUST NOT
  ever designate the owner.
- **FR-004a**: The "Administration" area MUST be renamed "Administrateur"; the owner's role
  MUST be displayed "Super administrateur".
- **FR-004b**: The super administrator MUST be able to act in all the roles of these journeys
  (Admin, Supervisor, Teacher).
- **FR-004c**: The demo account `responsable` MUST be renamed `admin` (identifier,
  display name, initialization data and associated test accounts).
- **FR-004d**: Specifications 001 and 003 MUST NOT be rewritten; a note there
  indicates that "Responsable" has become "Admin" and that the terminology of the current
  specification prevails.
- **FR-005**: Teachers and supervisors MUST stay employees, identified by
  their membership in the "Enseignants" and "Surveillants" groups (existing groups
  reused); an employee MAY belong to both groups.
- **FR-005a**: The existing group "Surveillants/Remplaçants" MUST be renamed "Surveillants"
  keeping its members; before the migration, the list of members who are not
  supervisors MUST be presented for decision.
- **FR-006**: Each class MUST belong to a floor, and each supervisor MUST be able to be
  attached to a single floor through a field of their profile. Only the super administrator MUST be able to
  create the floors and attach the classes to them; the admin MUST NOT modify this structure.
- **FR-006a**: A floor without a supervisor MUST give rise to a simple warning, with no
  blocking; no upper limit is imposed on the number of supervisors per floor.

#### Assignments

- **FR-007**: An assignment MUST record its source among: teacher request, supervisor
  report, direct creation by the admin.
- **FR-008**: An assignment MUST carry one of the six main statuses: en attente, assignée,
  en cours, terminée, annulée, non pourvue; only defined transitions are allowed.
- **FR-008a**: "Terminée", "annulée" and "non pourvue" MUST be final statuses.
  "Non pourvue" MUST be set automatically when the time slot has passed without any
  supervisor having been assigned. The cancellation MAY carry an optional reason. "Annulée" and
  "non pourvue" MUST be counted separately in the history and the statistics.
- **FR-008b**: On a request "en attente", the admin (or the super administrator) MUST be able to
  assign a supervisor or cancel the request (optional reason, status "annulée").
- **FR-008g**: The requesting teacher MUST be able to withdraw their own request as long as it is
  "en attente" (status "annulée", optional reason), and modify it (date, time slot, class,
  reason) under the same conditions; each modification MUST be traced in the history.
  Once the request is assigned, they MUST NO LONGER be able to modify or withdraw it.
- **FR-008h**: An "en cours" assignment MUST be cancellable only by the admin (or the
  super administrator), optional reason (e.g. empty class reported by mistake).
- **FR-008i**: Cancelled assignments MUST NOT be counted as actual latenesses or
  absences in the statistics; they MUST be counted separately.
- **FR-008e**: On an "assignée" assignment, the admin (or the super administrator) MAY
  cancel it (optional reason) or reassign it to another available supervisor; only the admin
  decides. In case of cancellation or reassignment, the former supervisor MUST be notified that their
  assignment is lifted; in case of reassignment, the new one MUST receive the order and the status
  MUST stay "assignée".
- **FR-008j**: On an "en cours" assignment, the admin (or the super administrator) MAY
  reassign it to another available supervisor; the status MUST stay "en cours" and the new
  supervisor MUST be notified. The original supervisor MUST be released only once the
  new one's presence is confirmed by the existing handover mechanism.
- **FR-008k**: Every reassignment MUST be traced (author, date and time, former and new
  supervisor).
- **FR-008f**: The assigned supervisor MUST NOT be able to accept, refuse or cancel an
  assignment; they MUST only be able to update its progress ("en cours", then
  "terminée").
- **FR-008c**: An assignment MAY carry a sub-state, displayed as a badge, which does not modify its
  main status: "En route" and "En retard" under "assignée"; "Relève demandée" under
  "en cours"; "Clôturée après validation" under "terminée". Filters, statistics and alerts
  MUST be based on the main status.
- **FR-008d**: At update time, the existing finished guard duties MUST be attached to the equivalent
  main status ("terminée"), their old label kept as a sub-state; no
  history data MUST be deleted or rewritten. A prior check MUST list any
  old status with no obvious equivalent and submit it for decision before the migration.
- **FR-009**: Only the admin MUST be able to assign a supervisor to an assignment and create a
  direct assignment; these rights MUST be checked server side and any refusal logged.
  Only exception: the empty-class report by a supervisor creates the assignment in their name
  (FR-015).
- **FR-010**: The system MUST offer the admin only the available supervisors: a
  supervisor with an active assignment (assigned or in progress, backup included) whose range
  overlaps the requested range MUST NOT be offered. The list MUST present first the
  supervisors of the class's floor, then the others; the admin MAY assign a supervisor
  from another floor. A supervisor whose declared availability is "Indisponible" or
  "Absent" MUST NOT be offered.
- **FR-011**: An assignment MUST be an existing guard duty enriched with its source, the floor
  and the teacher concerned.
- **FR-011a**: The broadcast of a guard duty to a group with pick-up by the first volunteer MUST
  be removed; the supervisor MUST be notified when the admin assigns them. The existing
  guard duty tests MUST be adapted to this change.
- **FR-011b**: Presence confirmation by QR code or photo, extension, handover and
  deadlines MUST work on assignments as they do today on guard duties; only
  the allocation changes (a handover is therefore assigned by the admin, no longer broadcast).
- **FR-011d**: The pick-up deadline (2 minutes by default, adjustable) MUST measure the time
  left to the admin to assign a supervisor. It MUST start at creation if the time slot has
  started or begins in less than 60 minutes (adjustable threshold), and otherwise at the moment the start of the
  time slot goes under this threshold. It MUST NOT apply to an empty class reported by a
  supervisor.
- **FR-011e**: At the expiry of the deadline, an alert MUST be sent to the admin; if no
  reply occurs within 5 minutes (adjustable duration), the alert MUST be escalated to the super
  administrator. The escalation MUST stop as soon as the request is assigned or cancelled (by
  the admin, or withdrawn by the teacher); viewing the alert MUST NOT stop it. The request MUST stay "en attente" and be shown first.
- **FR-011f**: For a request concerning a later date, a reminder MUST be sent at
  7:00 (adjustable time) on the day concerned, to the admin only, if the request is
  still "en attente" at that time.
- **FR-011c**: At update time, the guard duties still open (being broadcast) MUST be
  kept and presented to the admin "en attente"; guard duties already taken by a volunteer
  MUST stay unchanged. The "Non pourvues" guard duties whose time slot has not passed MUST
  go back to "en attente"; those whose time slot has passed MUST stay "non pourvues" in
  the history and be counted in the statistics.

#### Teacher journey

- **FR-012**: A teacher MUST be able to report a lateness or absence for today or
  tomorrow only, never for a range already entirely past, with no minimum notice,
  indicating the date, the start time, the end time (or a duration), the class —
  chosen among all the classes of the school — and, optionally, a reason (expected arrival
  time: none, the end is the closure by the supervisor — FR-016). A request MUST concern a single class and a single time range; an
  absence over several ranges or classes gives rise to several requests.
- **FR-012a**: The model MUST allow grouping several requests under one
  absence later without a redesign (absence management postponed).
- **FR-013**: The report MUST create an "en attente" assignment with source "demande
  enseignant" and notify the admin in real time.
- **FR-014**: The teacher MUST be able to view their reports and their status, and modify or withdraw them under the conditions of FR-008g.

#### Supervisor journey

- **FR-015**: A supervisor MUST be able to report an empty class; the report creates
  directly an assignment in their name, with source "signalement surveillant", with no assignment
  by the admin; it starts directly "en cours" and the admin is informed in real time.
- **FR-015a**: Indicating the teacher concerned MUST be optional, empty by default, and
  MUST NEVER block the report; the supervisor MAY choose a member of the
  "Enseignants" group or leave the field empty. No pre-fill in this feature; the
  design of the field MUST allow adding a pre-fill from a future timetable
  without a redesign.
- **FR-015b**: An assignment with no teacher filled in MUST be counted in the statistics
  as "classe sans enseignant, enseignant non précisé".
- **FR-015c**: The admin (or the super administrator) MUST be able to complete or correct
  the teacher of an assignment after the fact; each correction MUST be traced.
- **FR-015d**: If the identified teacher already has a request for the same class on an overlapping
  time range, the report MUST be attached to that request instead of creating a
  duplicate. If the request is "en attente", it MUST become "en cours" with the reporting
  supervisor.
- **FR-015e**: If the matching request is already "assignée" to another supervisor, it
  MUST NOT be modified automatically: the assigned supervisor stays responsible, the
  reporter MUST be informed of who is assigned, and the admin MUST be notified to decide
  (reassign or leave).
- **FR-015f**: If an "en cours" assignment already exists for the same class on an overlapping
  range (whether it comes from a request or from another report), the report MUST be
  attached to it without creating a new assignment; the supervisor already present stays responsible;
  the reporter MUST be informed that the class is taken care of, and the admin MUST be
  informed and decide whether the second supervisor stays as backup or resumes their round.
- **FR-015g**: If the report does not specify the teacher and a request exists for the
  same class on an overlapping range, the attachment MUST NOT be automatic:
  the application MUST propose it to the admin, who confirms or refuses; as long as it is not
  confirmed, the supervisor's assignment stays distinct. Every decision (confirmation or refusal)
  MUST be traced.
- **FR-015h**: As long as an attachment proposal is pending, the two assignments
  MUST be marked "doublon possible" and counted only once in the statistics;
  at the decision, they MUST count as one event (attachment confirmed) or two
  (refused). The proposal MUST stay visible to the admin until a decision and be
  presented to her one last time if the two assignments are done without a decision. With no
  decision afterwards, they MUST stay counted only once with the mention "non tranché",
  and the statistics MUST distinguish these "non tranchés" duplicates from the final figures.
  The admin (or the super administrator) MUST be able to decide at any time, including after
  the fact; the count MUST then be corrected and the correction traced.
- **FR-015i**: A supervisor on backup MUST be considered busy (not offered for another
  assignment) as long as they are in the class; they MUST become available again when the admin
  releases them or when the assignment becomes "terminée". With no decision from the admin on this backup, a
  reminder MUST be sent to her every 10 minutes (adjustable duration), within a limit of 3 reminders
  (adjustable cap); after the last one, the alert MUST be forwarded to the super administrator.
- **FR-015j**: A supervisor who is already busy and reports an empty class MUST still receive
  the assignment in their name, "en cours"; this is the only case where two active assignments of the
  same supervisor may overlap. The admin MUST immediately receive a highlighted alert and
  MAY reassign one or the other of the two assignments; everything MUST be traced.
- **FR-016**: An assignment MUST end when the supervisor marks it "terminée" (on the
  teacher's arrival); the closing time is recorded and they become available again.
- **FR-016a**: An assigned or in-progress assignment whose time slot is over with no closure MUST
  trigger a reminder to the supervisor 10 minutes after the end of the time slot (adjustable), then a
  reminder to the admin after 10 more minutes with no reply (adjustable). For an earlier
  guard duty with no end time ("jusqu'à l'arrivée", until arrival), the end of the time slot is deemed to be the end
  of the local day: no closing reminder MUST go out before then.
- **FR-017**: The supervisor MUST be notified of any assignment assigned to them (class,
  time slot) and be able to view their assignments.
- **FR-017a**: The teacher who authored a request MUST be notified in the application when a
  supervisor is assigned to their request, or reassigned; the notification states the class, the
  time slot and the supervisor's name, with no other detail.

#### Admin journey

- **FR-018**: The admin MUST see in real time the pending, assigned and in-progress assignments.
- **FR-019**: The admin MUST be able to create a direct assignment (class, time slot, available
  supervisor), which is born "assignée" with the source "création directe".

#### History and statistics

- **FR-020**: Each creation, assignment, status change and closure MUST be traced in a
  non-modifiable way (author, date and time, before/after values).
- **FR-021**: The history MUST keep for each assignment the teacher concerned, the
  class, the time slot, the supervisor, the source, the timestamps and the duration, measured from the switch to
  "en cours" until "terminée" (for an empty class reported, from the report).
- **FR-022**: The admin and the super administrator MUST be able to view the history and the
  statistics: number of latenesses per teacher, per class, per period, average duration, rate
  of "non pourvue"; the "annulées" and the "non tranchés" duplicates MUST be counted
  separately. No export in this phase.
- **FR-023**: Per-teacher statistics and histories MUST be reserved to the admin and the
  super administrator; a teacher MUST see only their own requests.
- **FR-023a**: After one school year (adjustable duration, to be validated with management),
  the teacher and the reason MUST be anonymized in the module's data; the events
  (date, class, duration, status) MUST be kept for the overall statistics. The audit
  log MUST be excluded from this anonymization and stay non-modifiable.
- **FR-023c**: The assigned supervisor MUST see the class, the floor, the time slot and the type of
  report (lateness, absence, empty class), but MUST NEVER see the detailed reason entered
  by the teacher, reserved to the admin and the super administrator.
- **FR-007a**: Each assignment MUST carry a type: lateness, absence or empty class. It is
  chosen by the teacher for their request, by the admin for a direct assignment, and is
  "classe vide" for a supervisor report.
- **FR-023b**: The module MUST be accessible only to the admin, the super administrator, the
  supervisor (their assignments) and the teacher (their requests); other employees see none of it.
  All admins have access to it, with no restriction by guard category.

#### Notifications

- **FR-024**: All the module's events MUST be notified in the application, via the
  existing real-time mechanism. No external channel (email, SMS, push) is added; none
  exists today.
- **FR-024a**: Urgent cases (empty class reported, expiry of the pick-up deadline,
  escalation, supervisor with two active assignments) MUST give rise to a highlighted alert, visual and, where applicable,
  sound; the information MUST never rely on sound alone.

#### Media

- **FR-025**: The changes MUST apply to the existing web application, on all the
  formats it already serves (smartphone, tablet, computer); no new medium is
  created.

### Key Entities *(include if feature involves data)*

- **Admin**: renamed "Responsable" role, same rights (work requests: according to the category's
  routing mode, Q22); oversees, receives information,
  assigns. Distinct from the "Super administrateur", who can nevertheless play all the roles of these
  journeys.
- **Teacher**: employee member of the "Enseignants" group; reports a lateness or absence;
  classes they can report: Q6.
- **Supervisor**: employee member of the "Surveillants" group, whose profile carries a single floor
  of attachment; assignable to the classes of any floor.
- **Floor**: groups several classes; 1 or 2 supervisors attached.
- **Class**: existing; receives an attachment to a floor.
- **Time slot** (« Créneau »): free time range (date, start time, end time) that an
  assignment covers and on which availability is computed; no fixed grid.
- **Assignment**: guard of a class on a time slot by a supervisor; source, type (lateness /
  absence / empty class), optional reason, status, timestamps, duration; it is the existing guard duty
  enriched.
- **Assignment history**: non-modifiable sequence of an assignment's events (existing).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teacher sends a lateness or absence report in under 1 minute.
- **SC-002**: A supervisor reports an empty class in under 30 seconds from a smartphone.
- **SC-003**: The admin is informed of a report or declaration in under 5 seconds
  when she is logged in.
- **SC-004**: The admin assigns an available supervisor in under 1 minute after receiving the
  report.
- **SC-005**: 100% of the supervisors offered to the admin are free on the time slot (no conflict
  in the acceptance tests).
- **SC-006**: 100% of finished or cancelled assignments appear in the history with author,
  class, time slot, source and duration.
- **SC-007**: After the update, no interface text uses "responsable" in the sense of the
  role, and 100% of the existing journeys replayed pass.
- **SC-008**: No assignment or assignment-creation action succeeds for an account
  other than admin (server-side refusal tests).

## Assumptions

Only observed facts, constitution constraints or confirmed choices (see
"Clarifications") appear here.

- The constitution's rules apply: tests written first, finite statuses with
  defined transitions, non-modifiable audit log, server-side rights checks,
  WCAG 2.2 AA accessibility, personal data minimization.
- The accounts already exist and the current authentication is reused.
- The existing real-time notification mechanism is reused (FR-024).
- Out of scope (confirmed): timetable and teacher ↔ classes link, postponed to a later
  phase.
- Out of scope (confirmed): absence management (whole day, multi-class, long
  absences), postponed to a later phase.
- Out of scope (confirmed): floor round tracking (no route, clocking or round
  tracking).
- Out of scope (confirmed): management of supervisors' leave and absences; export of
  statistics; external notification channels (email, SMS, push).
- Out of scope: pedagogical replacement (lesson taught by another teacher), payroll or
  hour counting, integration with external school-life software.

## Amendment (2026-11-09): presence confirmation by scanning inside the app

**Why**: to confirm their presence with a QR proof, supervisors had to leave the application, scan the class
QR code with the phone's own camera app, then tap « Confirmer ma présence » on the page it opened. The
empty-class declaration (spec 013) already scans inside the application and sends at once; the school asked
for the same way of scanning when confirming presence. Server rules (proof required per category, QR checks,
allowed states) are unchanged.

- **FR-011b-1**: In the « Confirmer ma présence en classe … » window, a proof that includes the QR code MUST be
  given with « Scanner le QR code de la classe », which opens the in-app QR reader of spec 013 (camera, photo of
  the QR code, or pasted link or code).
- **FR-011b-2**: Proof « QR »: the presence MUST be sent as soon as the class QR code is read, with no other tap.
- **FR-011b-3**: Proof « QR + photo »: both proofs remain required; the supervisor MAY take the photo and scan
  the QR code in either order, and the presence MUST be sent as soon as both are done. A QR code read first is
  kept until the photo is taken, and the window says so.
- **FR-011b-4**: A QR code of another class MUST send nothing and say which class to scan. A refusal by the
  server MUST be shown in the window; the photo stays and a new scan sends the presence again.
- **FR-011b-5**: Proof « photo » and the page opened by the phone's own camera app (`/gardes/presence`,
  explicit « Confirmer ma présence ») MUST stay as they are.

Tests: `frontend/tests/coverage/coverage.test.tsx` (« Confirmer ma présence : scan du QR dans l'application »)
and the end-to-end scenario « classe changée « En route » » in `e2e/coverage-class.spec.ts`, which now confirms
the presence inside the app (photo, then a real image of the QR code read by the in-app reader).
