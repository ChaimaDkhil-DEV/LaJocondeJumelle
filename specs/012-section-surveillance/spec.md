# Feature Specification: Section « Surveillance » — renommage et trois onglets pour l'administration (« Surveillance » section — renaming and three tabs for the administration)

**Feature Branch**: `012-section-surveillance`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Renommer la section « Gardes de classe » (entrée de menu « Gardes ») en « Surveillance », sans créer de nouvelle section, et réorganiser la vue de l'admin et du super administrateur en trois onglets : 1. « Absences et retards » (signalements des enseignants et signaux déjà connus de l'application, pas de détection automatique nouvelle) ; 2. « Affectation des surveillants » (file en attente, nouvelle affectation, doublons, équipe) ; 3. « Suivi des interventions » (filtres « En attente », « Prise en charge », « Terminée », chaque ligne gardant son statut précis, aucun changement des statuts côté serveur). Vues des enseignants et des surveillants inchangées ; adresses /gardes/... inchangées ; droits inchangés."

## Context

The « Gardes » section (page title « Gardes de classe ») gives the admin and the super administrator six
tabs: « En attente », « En cours », « Doublons », « Équipe », « Terminées », « Présences ». The school
wants the section named after its job, « Surveillance », and the administration view grouped by what
the administration does: see the situations, assign a supervisor, follow the interventions.

Decisions of the user (2026-11-08, counting as clarifications):

- **no new section**: the existing section is renamed « Surveillance »;
- « Absences et retards » shows only **signals the application already knows**; the application does
  not detect absences by itself (there is no timetable, so no list of « expected » teachers) and this
  feature does not add one;
- « Suivi des interventions » offers **three filters**, each row keeping its precise status; the
  statuses themselves do not change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The section is called « Surveillance » (Priority: P1)

Every user who has access to the section (admins, super administrator, members of the Surveillants or
Enseignants groups) sees « Surveillance » in the menu and as the page title, instead of « Gardes » and
« Gardes de classe ». Links and printed QR codes keep working.

**Why this priority**: the name is visible to everyone, on every screen of the section; it is the
smallest change that delivers the user's request.

**Independent Test**: sign in with each kind of account that sees the section; check the menu label,
the page title and the « back » links of the section's pages; open a printed class QR link and a
previously bookmarked address of the section.

**Acceptance Scenarios**:

1. **Given** an account that sees the section, **When** it opens the menu, **Then** the entry reads
   « Surveillance » and leads to the same page as before.
2. **Given** the section's page, **When** it is displayed, **Then** its title reads « Surveillance ».
3. **Given** a page reached from the section (detail of an assignment, new assignment, statistics),
   **When** it offers a link back, **Then** the link reads « Surveillance ».
4. **Given** a class QR code printed before the change, **When** a teacher or supervisor scans it,
   **Then** the presence page opens as before.
5. **Given** an account that did not see the section, **When** it opens the menu, **Then** it still
   does not see it.

---

### User Story 2 - « Absences et retards » (Priority: P1)

The general supervisor opens « Surveillance » and lands on « Absences et retards »: she sees the
lateness and absences reported by teachers, the empty classes declared by supervisors, the day's
QR clock-ins, and the late arrivals measured against an announced lateness — everything the current
« Présences » tab shows.

**Why this priority**: it is the first question of the morning (« who is missing? ») and the entry
point of the section.

**Independent Test**: with reported lateness, absences, an empty class and clock-ins of the day, open
« Absences et retards » as admin and check each appears, as today in « Présences ».

**Acceptance Scenarios**:

1. **Given** an admin or the super administrator, **When** they open « Surveillance », **Then** the
   tabs are « Absences et retards », « Affectation des surveillants », « Suivi des interventions », in
   this order, and the first one is selected.
2. **Given** lateness and absences reported by teachers and empty classes declared by supervisors,
   **When** the admin opens « Absences et retards », **Then** they all appear.
3. **Given** clock-ins of the day, **When** the admin opens « Absences et retards », **Then** they
   appear as in the former « Présences » tab, with the same actions (qualify, regularise).
4. **Given** a teacher who did not clock in and announced nothing, **When** the admin opens
   « Absences et retards », **Then** this teacher is not shown as absent (no timetable, as today).

---

### User Story 3 - « Affectation des surveillants » (Priority: P1)

From « Affectation des surveillants », the admin sees the situations still waiting for a supervisor
(expired takeover delays first, as today), assigns one, creates a new assignment, settles
possible duplicates and checks the team's availability.

**Why this priority**: assigning is the administration's main action in the section.

**Independent Test**: with waiting situations, possible duplicates and supervisors with various
availabilities, open the tab as admin; assign a supervisor, create an assignment, settle a duplicate,
change an availability.

**Acceptance Scenarios**:

1. **Given** situations waiting for a supervisor, **When** the admin opens « Affectation des
   surveillants », **Then** they appear in the same order as in the former « En attente » tab
   (expired takeover delays first).
2. **Given** the tab, **When** the admin wants to create an assignment, **Then** « Nouvelle
   affectation » is offered in this tab and opens the same form as before.
3. **Given** possible duplicates, **When** the admin opens the tab, **Then** she can settle them as in
   the former « Doublons » tab.
4. **Given** the team, **When** the admin opens the tab, **Then** she sees supervisors, their floor,
   availability and current assignments, and can change an availability, as in the former « Équipe »
   tab.

---

### User Story 4 - « Suivi des interventions » (Priority: P2)

The admin follows the interventions with three filters: « En attente », « Prise en charge », « Terminée ».
Each row still shows its precise status (« Assignée », « En route », « En retard », « En cours »,
« Relève demandée », « Annulée », « Non pourvue »…).

**Why this priority**: replaces three tabs by one, with the same content; useful but the
administration can work with the current tabs meanwhile.

**Independent Test**: with assignments in each status, open the tab as admin and switch filters;
compare each filter's rows with the former « En attente », « En cours » and « Terminées » tabs.

**Acceptance Scenarios**:

1. **Given** assignments in every status, **When** the admin selects « En attente », **Then** she sees
   exactly the assignments waiting for a supervisor.
2. **When** she selects « Prise en charge », **Then** she sees exactly the assigned and in-progress
   assignments (the former « En cours » tab).
3. **When** she selects « Terminée », **Then** she sees exactly the finished, cancelled and unfilled
   assignments (the former « Terminées » tab).
4. **Given** any row, **When** it is displayed, **Then** it shows its precise status and alerts, as
   today, never only the filter's name.
5. **Given** a filter, **When** the admin reloads the page or shares its address, **Then** the same
   tab and filter are selected.

---

### User Story 5 - Teachers and supervisors keep their views (Priority: P1)

Teachers keep « Mes signalements » and « Mes présences »; supervisors keep « Mes affectations » and
« Historique »; an account in several groups still sees all its tabs. Only the section's name changes
for them.

**Why this priority**: the reorganisation is for the administration; daily users must not lose their
bearings.

**Independent Test**: sign in as a teacher, a supervisor, and an account in both groups; compare tabs
and buttons with today.

**Acceptance Scenarios**:

1. **Given** a teacher, **When** she opens « Surveillance », **Then** she sees « Mes signalements » and
   « Mes présences » and the « Signaler un retard ou une absence » button, as today.
2. **Given** a supervisor, **When** he opens « Surveillance », **Then** he sees « Mes affectations » and
   « Historique » and the « Déclarer une classe vide » button, as today.
3. **Given** an admin who is also a member of a group, **When** she opens « Surveillance », **Then** she
   sees the three administration tabs followed by her group tabs.

### Edge Cases

- An address with a former tab key (for example a bookmark on « Terminées » or « Présences »): the
  matching new tab, and filter where relevant, opens instead of an empty page.
- No situation at all: each tab and filter shows its own empty message explaining what will appear.
- An account that loses its admin role while the page is open: its next refresh shows only its group
  tabs (rights checked by the server, unchanged).
- Small screens (320 px): the three tab labels and the filters stay reachable without horizontal page
  scroll.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The menu entry and the page title of the section MUST read « Surveillance » (English
  interface: « Supervision »), and links back to the section MUST read « Surveillance ».
- **FR-002**: The addresses of the section and of its pages MUST NOT change; printed class QR codes
  MUST keep working.
- **FR-003**: For admins and the super administrator, the section MUST show exactly three
  administration tabs, in this order: « Absences et retards », « Affectation des surveillants »,
  « Suivi des interventions ».
- **FR-004**: « Absences et retards » MUST show the reported lateness and absences and the content of
  the former « Présences » tab (clock-ins, announced requests, empty classes, state of the classes),
  with the same actions; it MUST NOT present a teacher as absent on the sole ground that no clock-in
  was recorded.
- **FR-005**: « Affectation des surveillants » MUST group the waiting situations (former « En attente »
  tab, same order), the « Nouvelle affectation » action, the duplicates (former « Doublons ») and the
  team (former « Équipe »).
- **FR-006**: « Suivi des interventions » MUST offer three filters — « En attente », « Prise en
  charge » (assigned and in progress), « Terminée » (finished, cancelled, unfilled) — whose rows are
  exactly those of the former « En attente », « En cours » and « Terminées » tabs.
- **FR-007**: Every row MUST keep showing its precise status and alerts.
- **FR-008**: The selected tab and filter MUST be kept in the page address; former tab addresses MUST
  open the matching new tab (and filter).
- **FR-009**: Teacher and supervisor tabs, buttons and the order of tabs for accounts in several groups
  MUST stay as they are.
- **FR-010**: Statuses, rights, notifications and server behaviour MUST NOT change.
- **FR-011**: The changed screens MUST meet the project's accessibility level (WCAG 2.2 AA, keyboard
  use, 320 px wide), with tabs and filters announced as such.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % of the screens of the section show « Surveillance » and none shows « Gardes ».
- **SC-002**: The administration view has 3 tabs instead of 6, and every item visible before is still
  reachable in at most 2 clicks from the section.
- **SC-003**: For a given set of assignments, each filter of « Suivi des interventions » lists exactly
  the same assignments as the former matching tab (0 missing, 0 extra).
- **SC-004**: 100 % of printed QR codes and previous addresses of the section keep working.
- **SC-005**: Teachers and supervisors see the same tabs and buttons as before (no change besides the
  section name).

## Assumptions

- The word « garde » elsewhere (category « Garde de classe » or « Garde surveillance », notifications,
  history wording, the super administrator's « Suivi des gardes » tab in « Administrateur ») is out of
  scope and unchanged; only the section's name changes.
- The « Statistiques » and « Déclarer une classe vide » buttons stay in the section header; « Nouvelle
  affectation » moves into « Affectation des surveillants ».
- « Affectation des surveillants » and the « En attente » filter of « Suivi des interventions » show
  the same waiting situations: the first to act, the second to follow.
- English labels: « Supervision », « Absences and lateness », « Supervisor assignment »,
  « Intervention tracking », filters « Pending », « Taken over », « Finished ».
- No change to the data model, to the statuses or to the server.
