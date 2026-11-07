# Feature Specification: Espace Administrateur pour l'ADMIN — données de référence et liste des employés (Administrator space for ADMIN — reference data and employee list)

**Feature Branch**: `011-espace-admin-donnees-reference`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Compléter l'espace de l'administrateur (rôle ADMIN, ex-« Responsable ») : aujourd'hui tout l'espace /admin est réservé au SUPER_ADMIN. L'ADMIN doit désormais pouvoir gérer les données de référence de l'établissement : étages, niveaux, classes (y compris l'impression et la révocation des QR codes des classes, comme le super administrateur) et élèves (création, modification, import CSV). Il doit aussi pouvoir consulter la liste des employés en lecture seule (nom, rôle, groupes, statut actif), sans créer ni modifier de compte ni réinitialiser de mot de passe. Les affectations restent gérées par la page « Gardes » existante (rien à ajouter). Restent réservés au SUPER_ADMIN : gestion des comptes, catégories, consignes, groupes, réglages, journal d'audit, suivi des gardes et tableau de bord. Droits vérifiés côté serveur, chaque refus journalisé ; l'interface n'affiche à l'ADMIN que les sections autorisées."

## Context

The application has three roles: `SUPER_ADMIN`, `ADMIN` (formerly « Responsable », renamed by
migration 0009) and `EMPLOYEE`. Today the whole « Administrateur » space is reserved for the
super administrator, both on the server and in the interface. The `ADMIN` already manages
class guard duties (« Gardes » page) and meal services (« Restauration »), but must ask the
super administrator for every change to floors, levels, classes or students, and cannot see
who works in the school.

Decisions of the user (2026-11-07, counting as clarifications):

- the employee list is **read only** for the `ADMIN` (least privilege);
- **nothing is added for assignments**: the existing « Gardes » page is enough;
- the `ADMIN` manages classes **exactly like the super administrator**, including printing and
  revoking their QR codes;
- account management, categories, guidelines, groups, settings, audit log, guard tracking
  (« Suivi des gardes ») and the dashboard **stay reserved for the super administrator**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage floors, levels and classes (Priority: P1)

The general supervisor (role `ADMIN`) opens « Administrateur » and sees the « Étages »,
« Niveaux » and « Classes » sections. At the start of the year she adds a new floor, creates
the level « 6e » and the classes « 6e A » and « 6e B » on that floor, renames a class, and
deactivates a class that no longer exists. She prints the QR code of a class and, after a
printed sheet is lost, revokes the old QR codes and prints the new one.

**Why this priority**: floors, levels and classes are the base of guard duties and student
lists; the `ADMIN` runs these daily and depends on the super administrator for every change.

**Independent Test**: with an `ADMIN` account, create, edit and deactivate a floor, a level and
a class, print then revoke a class QR code; check that the old QR code no longer works and that
each action appears in the audit log under the `ADMIN`'s name.

**Acceptance Scenarios**:

1. **Given** an active `ADMIN`, **When** she opens « Administrateur », **Then** she sees the
   « Étages », « Niveaux », « Classes », « Élèves » and « Employés » sections, and only those.
2. **Given** an active `ADMIN` on « Étages », **When** she creates, renames, reorders or
   deactivates a floor, **Then** the change is saved with the same rules and messages as for
   the super administrator.
3. **Given** an active `ADMIN` on « Niveaux », **When** she creates or edits a level, **Then**
   the change is saved with the same rules as for the super administrator.
4. **Given** an active `ADMIN` on « Classes », **When** she creates, edits or deactivates a
   class, **Then** the change is saved with the same rules as for the super administrator.
5. **Given** a class with a printed QR code, **When** the `ADMIN` revokes its QR codes,
   **Then** the old QR code is refused and the new one, shown to her for printing, works.
6. **Given** any change made by an `ADMIN`, **When** the super administrator opens the audit
   log, **Then** the change appears with the `ADMIN` as author, as it does for his own changes.

---

### User Story 2 - Manage students (Priority: P1)

The `ADMIN` opens « Élèves », adds a student who arrives mid-year, corrects the class of
another, and imports the list of a whole class from a CSV file: she first checks the file
(dry run), fixes the reported lines, then imports it.

**Why this priority**: student lists change all year (arrivals, class changes) and are used by
the meal service the `ADMIN` already runs.

**Independent Test**: with an `ADMIN` account, create and edit a student, run a CSV import in
check mode then for real; check the result and the audit log.

**Acceptance Scenarios**:

1. **Given** an active `ADMIN` on « Élèves », **When** she creates or edits a student,
   **Then** the change is saved with the same rules as for the super administrator.
2. **Given** a CSV file with errors, **When** the `ADMIN` checks it, **Then** the errors are
   listed by line and nothing is created.
3. **Given** a valid CSV file, **When** the `ADMIN` imports it, **Then** all students are
   created, or none if any line fails.

---

### User Story 3 - See the employee list (Priority: P2)

The `ADMIN` opens « Employés » to know who is in the school: she sees each employee's name,
job title, role, groups (for example Surveillants, Enseignants), floor if any, and whether the
account is active. There is no button to create or edit an account or reset a password.

**Why this priority**: useful to organise guard duties and know who to contact, but the
`ADMIN` can already work without it.

**Independent Test**: with an `ADMIN` account, open « Employés », check the shown columns and
the absence of any account action; call the account management actions directly and check
they are refused and logged.

**Acceptance Scenarios**:

1. **Given** an active `ADMIN`, **When** she opens « Employés », **Then** she sees every
   account (active and inactive) with name, job title, role, groups, floor and active status.
2. **Given** an active `ADMIN` on « Employés », **When** she looks for an action on an account,
   **Then** none is offered (no creation, editing, activation, password reset or import).
3. **Given** an active `ADMIN`, **When** she tries to create, edit or reset an account by any
   other means, **Then** the server refuses, logs the refusal and nothing changes.

---

### User Story 4 - Sections that stay reserved (Priority: P1)

Account management, categories, guidelines, groups, settings, audit log, « Suivi des gardes »
and the dashboard stay reserved for the super administrator, and `EMPLOYEE` accounts still
have no access to the « Administrateur » space at all.

**Why this priority**: opening reference data must not open anything else (least privilege,
constitution principle V).

**Independent Test**: with an `ADMIN` and an `EMPLOYEE` account, call each reserved section and
action; check they are refused, logged, and do not reveal whether a resource exists.

**Acceptance Scenarios**:

1. **Given** an active `ADMIN`, **When** she opens the address of a reserved section, **Then**
   she sees a clear access message and no data from that section.
2. **Given** an active `ADMIN`, **When** she calls a reserved action on the server, **Then**
   it is refused and the refusal is logged with her identity and the target.
3. **Given** an `EMPLOYEE`, **When** he opens any section of the « Administrateur » space or
   calls one of its actions, **Then** it is refused and logged, as today, and the
   « Administrateur » menu entry is not shown to him.
4. **Given** the super administrator, **When** he uses the « Administrateur » space, **Then**
   nothing changes for him.

### Edge Cases

- An `ADMIN` is demoted to `EMPLOYEE` or deactivated while a page is open: her next action is
  refused (rights are checked on every action, not only at sign-in).
- An `ADMIN` opens « Administrateur » without a section: she lands on her first allowed
  section, not on a reserved one.
- An `ADMIN` deactivates a floor or class used by guard duties or students: same rules and
  warnings as for the super administrator.
- An `ADMIN` revokes a class's QR codes while a supervisor is scanning it: the scan with the old
  code is refused, as for a revocation by the super administrator.
- The employee list includes the super administrator and other `ADMIN` accounts: they are shown
  like any other account, still read only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an active `ADMIN` to list, create and edit floors, levels
  and classes, with the same validation rules, messages and effects as for the super
  administrator.
- **FR-002**: The system MUST allow an active `ADMIN` to view, print and revoke the QR codes of
  a class, with the same effects as for the super administrator.
- **FR-003**: The system MUST allow an active `ADMIN` to list, create and edit students and to
  import students from a CSV file (check mode and all-or-nothing import).
- **FR-004**: The system MUST allow an active `ADMIN` to view the list of employee accounts
  with only: name, job title, role, groups, floor and active status.
- **FR-005**: The system MUST NOT allow an `ADMIN` to create, edit, activate, deactivate or
  import accounts, or reset their passwords.
- **FR-006**: The system MUST keep account management, categories, guidelines, groups,
  settings, audit log, guard tracking and dashboard reserved for the super administrator.
- **FR-007**: The system MUST check these rights on the server for every action, from the
  current role and active status of the account.
- **FR-008**: The system MUST log every refused access with the account, the target and the
  reason, and MUST NOT reveal whether the targeted resource exists.
- **FR-009**: The system MUST record every change made by an `ADMIN` in the audit log with the
  `ADMIN` as author, as for the super administrator.
- **FR-010**: The interface MUST show the « Administrateur » menu entry to `ADMIN` and
  `SUPER_ADMIN` accounts only, and MUST show an `ADMIN` only the sections she is allowed to
  use.
- **FR-011**: The « Employés » section MUST NOT offer any account action to an `ADMIN`.
- **FR-012**: The new screens and changes MUST meet the project's accessibility level (WCAG 2.2
  AA, keyboard use, 320 px wide).

### Key Entities

- **Floor, Level, Class, Student**: existing reference data; no change to their content. Only
  who may manage them changes.
- **Class QR code**: existing; printable link of a class, revocable. Only who may revoke it
  changes.
- **Employee (account)**: existing; for the `ADMIN`, a read-only view limited to name, job
  title, role, groups, floor and active status.
- **Audit entry**: existing; records the `ADMIN`'s changes and refused accesses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An `ADMIN` can create a floor, a level, a class and a student without the super
  administrator's help, in under 5 minutes in total.
- **SC-002**: 100 % of the reserved actions (accounts, categories, guidelines, groups,
  settings, audit, guard tracking, dashboard) are refused to an `ADMIN`, and each refusal is
  logged.
- **SC-003**: 100 % of the « Administrateur » space actions are refused to an `EMPLOYEE`, as
  today.
- **SC-004**: The employee list shown to an `ADMIN` contains no login identifier, password
  state or other field beyond the six listed.
- **SC-005**: Nothing changes for the super administrator: all his existing journeys keep
  working.

## Assumptions

- « Groups » in the employee list means the existing coverage groups (for example Surveillants,
  Enseignants); « floor » is the floor a supervisor is attached to.
- The employee list does not show the login identifier, the « must change password » state or
  the creation date: they are not needed to know who works in the school (constitution
  principle IV, data minimisation).
- The `ADMIN` reuses the existing reference data screens; no new screen is designed except the
  read-only « Employés » list.
- No change to the data model is needed: only access rights and the interface change.
- The `ADMIN`'s existing rights (« Gardes », « Restauration », avatars) are unchanged.
