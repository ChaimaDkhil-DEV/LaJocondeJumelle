# Feature Specification: Fixes from the technical audit

> **Since feature 004, the role « Responsable » (Manager) is called « Admin »; the terminology of the
> current specification (`specs/004-retards-affectation-surveillants/spec.md`) prevails.**

**Feature Branch**: `003-corrections-audit-technique`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Fix the technical inconsistencies and weaknesses identified in
docs/ARCHITECTURE.md, in particular sections 7 « Incohérences constatées » (Inconsistencies found) and 10 « Faiblesses
d'architecture » (Architecture weaknesses). Use this report as the main source without redoing the audit from scratch.
Keep the [VERIFIED] and [INFERRED] distinctions. The scope covers the port 3002
configuration, security, tests, dependencies between modules, automatic assignment and FR-022,
as well as production readiness. Do not treat unvalidated business decisions
as final requirements. Distinguish the technical fixes that can be done from the decisions
requiring human validation."

## Source and method

- **Single source**: `docs/ARCHITECTURE.md` (analysis of 2026-10-15, branch
  `002-refonte-ui-destinataires`, commit `595c3fc`), in particular §7 « Incohérences
  constatées », §8, §9, §10 « Faiblesses d'architecture » and §11 « Ce que je dois vérifier
  moi-même » (What I must verify myself). The audit is **not** redone; each requirement points to the finding that justifies it.
- **Marking kept as is**:
  - **[VERIFIED]**: finding read in the code, the configuration or the result of a command;
  - **[INFERRED]**: unproven interpretation. A requirement based on an [INFERRED] finding MUST
    first confirm the finding (test or measurement) before any fix.
- **Update since the audit**: the three "uncommitted" changes cited by the audit (port 3002 in
  `config.ts`, `vite.config.ts`, `frontend/package.json`) and `start.bat` were
  committed on 2026-10-15 (`1e6d4ee`); `docs/ARCHITECTURE.md` was in `eafa1e6`. The
  findings remain valid: the `config.spec.ts` test still fails (verified after the commit).
- **Classification of each finding**:
  - **CT** — technical fix achievable without a business decision;
  - **DH** — decision requiring human validation (school or project lead);
  - **HP** — out of scope for this feature (recorded, not handled).

### Findings register

| ID | Finding (summary) | Source | Marking | Class |
|----|------------------|--------|----------|--------|
| A01 | The API's default port in development is 3002, but the example configuration, the README, the development HTTPS proxy and a unit test still say 3000; this test fails | §7.8, §9, §11.2 | [VERIFIED] | CT |
| A02 | The development launcher starts the **compiled** version of the API (no reload, prior build mandatory), while the README recommends the reload mode | §7.9, §9 | [VERIFIED] | CT |
| A03 | In workflow B, automatic assignment reads the **current** configuration of the category at approval, and not the rule frozen at submission | §7.1 | [VERIFIED] | DH (rule) then CT |
| A04 | Consequence: a change of assignment mode between submission and approval applies to requests already submitted | §7.1 | [INFERRED] | to be confirmed by a test |
| A05 | The script that resets the super administrator's password does not log the action and does not close their sessions | §10 Operations, §11.7 | [VERIFIED] | DH (keep or delete) then CT |
| A06 | The lists of masked sensitive keys differ between application logs and the audit log (`authorization` missing from the audit, `message` missing from the logs) | §10 Duplicated code | [VERIFIED] | CT |
| A07 | The proxy trust setting and the port are read outside the startup configuration validation | §8, §10 Responsibilities | [VERIFIED] | CT |
| A08 | The origin check is written twice (HTTP requests and real-time connections) | §10 Duplicated code | [VERIFIED] | CT |
| A09 | Import cycles between domains: requests ↔ files, authentication ↔ requests, common base ↔ audit and ↔ authentication; a workaround module exists for one cycle | §10 Couplings | [VERIFIED] | CT |
| A10 | File storage knows the access policy of each business domain (requests and class coverage) | §10 Couplings | [VERIFIED] | CT |
| A11 | Any new resource type with files will force a change to the file service | §10 Couplings | [INFERRED] | CT (consequence of A10) |
| A12 | Cross-cutting rules (permissions by role, administration and audit rights) placed in the access policy of the requests domain | §10 Responsibilities | [VERIFIED] | CT |
| A13 | The category rules loader is declared in 5 modules instead of being shared | §7.2 | [VERIFIED] | CT |
| A14 | Impact of A13 is low (stateless service) | §7.2 | [INFERRED] | — |
| A15 | The class coverage deadlines job is placed outside the scheduled tasks folder | §7.3 | [VERIFIED] | CT |
| A16 | "No-op" notification publisher exported but unused, outdated comment | §7.4 | [VERIFIED] | CT |
| A17 | Frontend types written by hand; the announced generated types file does not exist; enums are duplicated between server and interface | §7.5, §10 Duplicated code | [VERIFIED] | CT |
| A18 | Icons dependency declared but never imported | §7.6 | [VERIFIED] | CT |
| A19 | Two operations scripts do not follow the project's formatting convention | §7.7 | [VERIFIED] | CT |
| A20 | Integration tests, end-to-end tests and lint not run by the audit | §10 Testability, §11.3, §11.4 | [INFERRED] (not run) | CT |
| A21 | No continuous integration in the repository; manual deployments | §9 | [VERIFIED] / [INFERRED] | DH |
| A22 | Migrations applied automatically at every startup, with no technically enforced backup | §10 Operations | [VERIFIED] | CT |
| A23 | A faulty migration would prevent the API from starting without an intermediate step | §10 Operations | [INFERRED] | CT (to be covered by the procedure) |
| A24 | Restoring backups never verified | §11.8 | [INFERRED] (not tested) | CT |
| A25 | CSP, HSTS and size limit configured but not verified on a real deployment | §11.12 | [INFERRED] (not tested) | CT |
| A26 | Performance objectives covered by tests not run by the audit | §11.9 | [INFERRED] (not run) | CT |
| A27 | No automatic purge of personal data; retention periods provisional | §10 Operations, §11.10 | [VERIFIED] | DH |
| A28 | Only one API instance possible (in-memory state) | §10 Operations | [VERIFIED] | HP (accepted by the phase 1 plan) |
| A29 | Two state machines, two access policies, two deadline computations and jobs (phase 1 and phase 2) | §10 Duplicated code | [VERIFIED] | HP |
| A30 | Large services (class coverage, requests) | §10 Responsibilities | [VERIFIED] | HP |
| A31 | Six global modules hide the real dependencies | §10 Couplings | [VERIFIED] / [INFERRED] | HP |
| A32 | Phase 2 (class coverage) without a specification | §11.5 | [VERIFIED] | DH / HP |
| A33 | No error tracking tool or metrics | §8 | [INFERRED] | HP |
| A34 | `embedded-postgres` in beta version (development and tests only) | §10 Operations | [VERIFIED] | HP |
| A35 | Manual validations (real iPhone, usability test) not done | §11.11 | [VERIFIED] | HP (tasks T119, T120 of phase 1) |

### Processing status (as of 2026-10-16)

Detail per finding, with the commits: `docs/ARCHITECTURE.md` §12; runs:
`docs/validation/verification-003.md`.

- **Fixed**: A01, A02, A03, A05 to A10, A12, A13, A15 to A19, A21 (CI; merge verified by
  hand, decision D10), A22; as well as N1 and N3.
- **[INFERRED] confirmed then fixed** (re-marked [VERIFIED]): A04 (test written before the
  fix, FR-009) and A11 (reading of `files.service.ts`).
- **Partially verified**: A20 (lint, integration and interface tests green; end-to-end
  not run, T058); A26 (search verified by `search-performance.spec.ts`; creation timing
  not run, T058).
- **Open, awaiting staging**: A23 (T055), A24 (T056), A25 (T057).
- **Not applicable**: A14 (A13 fixed). **School decisions, out of scope**: A27 (D4),
  A32 (D5). **Out of scope**: A28 to A31, A33 to A35.
- N2: cycle reduced from 11 folders to 4 (`auth`, `realtime`, `settings`, `users`), out of scope.

## Clarifications

### Session 2026-10-15

- Q: Which automatic assignment rule applies when the category changes between
  submission and approval (D1)? → A: everything is frozen at submission, mode **and** designated
  person, following the letter of FR-022 (phase 1); if the frozen person is no longer
  assignable, approval without a chosen employee is refused (FR-011). The only two exceptions,
  EXC-1 and EXC-2 of FR-008, were settled afterwards (D9 and D8, next session).
- Q: What to do with the super administrator password reset tool (D2)?
  → A: integrate it as a subcommand of the existing initialization tool, which already logs
  to the audit; the separate script is deleted.
- Q: How to replay the quality checks before each delivery (D3)? → A: automatic continuous
  integration for lint and the unit, interface and integration tests;
  recorded manual execution for the end-to-end and performance tests.

### Session 2026-10-15 (2) — follow-up to `/speckit-analyze` (finding I1)

- Q: When the person frozen at submission is no longer assignable at approval (deactivated
  account, or removed from the category recipients), what happens after the refusal
  (D8)? → A: the `AUTO_ASSIGNEE_UNAVAILABLE` refusal is returned first; the manager can
  then approve by choosing an assignable employee themselves; the history traces this choice.
- Q: For requests submitted before the fix, whose snapshot does not contain the designated
  person, which rule applies at approval (D9)? → A: the designated person is read
  from the current configuration of the category (current behavior), and the history says so.

### Session 2026-10-15 (3) — GitHub limit observed (finding G3)

- Q: Branch protection rules are not available on the repository (private, free GitHub
  plan: the API returns `403 Upgrade to GitHub Pro or make this repository public`).
  How to guarantee that no change is merged if the test suite fails (D10)?
  → A: the repository stays private, with no paid subscription for now; automatic branch
  protection is postponed. GitHub CI (D3) is kept; a documented **manual** check
  is mandatory before every merge into `master`. It is not a technical
  protection: GitHub does not prevent a merge whose tests fail.

## User Scenarios & Testing *(mandatory)*

The actors are: the **developer** who installs and evolves the project, the **operator** who
deploys and backs up the application, the **super administrator**, and the **users** of the
categories in workflow B (requesters, managers, assigned employees).

### User Story 1 - Start and test the project without port inconsistency (Priority: P1)

A developer fetches the repository, follows the README, copies the example configuration and starts
the application. The interface reaches the API the first time, on development port 3002, and the
full test suite passes.

**Why this priority**: today a test fails (A01) and the constitution forbids merging
anything while the suite is red (principle I). Everything else in the feature
depends on it.

**Independent Test**: on a clean workstation, follow only the README, then run all the test
suites; no file must be modified by hand.

**Acceptance Scenarios**:

1. **Given** a workstation with no local configuration, **When** the developer copies the example
   configuration without changing it (apart from the secret) and starts the API then the interface, **Then**
   the interface shows the login page and its calls to the API succeed.
2. **Given** the development HTTPS proxy (microphone test on a phone), **When** it is
   started, **Then** it relays calls to the API to port 3002, like the interface's
   proxy.
3. **Given** the project configuration, **When** the unit suite runs, **Then** the configuration
   test checks the default value 3002 and passes.
4. **Given** the Windows launcher, **When** the developer uses it after a change to the
   server code, **Then** the change is picked up without a manual build step
   (A02), or the README explicitly states the required step.
5. **Given** the production environment, **When** the API starts in its container, **Then**
   it listens on the port explicitly set by the deployment, without depending on the development
   default value.

---

### User Story 2 - Guarantee traceability and security of sensitive operations (Priority: P1)

The operator can reset the super administrator's access in case of a lost password,
and this operation is traced like any other administration action. The logs leak
no secret, whatever their destination, and the same origin checks
apply to all entry paths.

**Why this priority**: the constitution (principle V) requires every administration action to be
traced in a tamper-proof way; the current script bypasses it (A05). The masking gaps
(A06) and unvalidated configuration (A07) directly affect data protection
(principle IV).

**Independent Test**: run the reset on a test database and check the audit log and the sessions; inject sensitive values into both types of logs;
start the API with an invalid proxy configuration.

**Acceptance Scenarios**:

1. **Given** a super administrator with two open sessions, **When** the operator
   resets their password with the initialization tool's subcommand (FR-010), **Then** a
   tamper-proof audit entry is created (action, target, date, origin "operations
   tool"), both sessions are closed and the account must change its password
   at the next login.
2. **Given** an event containing an authorization header, a password, a token or the
   content of a message, **When** it is written to the application logs or to the audit
   log, **Then** these values are masked in both.
3. **Given** an invalid proxy trust value or port, **When** the API
   starts, **Then** it refuses to start with an explicit message, like for the other
   required variables.
4. **Given** a modifying request or a real-time connection coming from a foreign
   origin, **When** it arrives, **Then** it is refused by a single origin rule,
   identical for both paths, and the refusal is logged.

---

### User Story 3 - Automatic assignment following the snapshot rule (Priority: P2)

A manager approves, in workflow B, a request submitted in a category with automatic
assignment. The assignment mode **and** the designated person are those frozen at submission
(decision D1, FR-022 of phase 1), even if the administrator changed the category between
submission and approval. Only two exceptions apply (FR-008): **EXC-1**, a
request submitted before the fix, whose snapshot does not contain the designated person, is
assigned according to the current category (decision D9); **EXC-2**, if the frozen person is no longer
assignable, approval is refused and then the manager chooses an assignable employee
(decision D8, FR-011).

**Why this priority**: [VERIFIED] gap with a written requirement (FR-022 of phase 1), but it only
occurs if a category's configuration changes while a request is awaiting
approval.

**Independent Test**: submit a request, change the category's assignment mode or person,
approve, then check the assigned person.

**Acceptance Scenarios**:

1. **Given** a request submitted when the category designated employee E1, **When**
   the administrator designates E2 and then the manager approves, **Then** the request is assigned
   to E1 (person frozen at submission).
2. **Given** a request submitted with automatic assignment, **When** the administrator switches the
   category to manual assignment before approval, **Then** the request is still
   assigned automatically to the person frozen at submission.
3. **Given** the person frozen at submission is no longer assignable at approval (account
   deactivated or removed from the category recipients), **When** the manager approves without
   choosing an employee, **Then** approval is refused with a message inviting them to choose
   the employee, without changing anything; **When** they then approve by choosing an
   assignable employee, **Then** the request is assigned to that employee (decision D8).
4. **Given** a request submitted before the fix, whose snapshot does not contain the
   designated person, **When** the manager approves, **Then** the request is assigned to the
   person designated in the current category (decision D9).
5. **Given** the assignment done, **When** the request's history is consulted, **Then**
   the assignment event created by the approval shows the assigned person and its source:
   snapshot, current category (EXC-1, D9) or manager's choice (manual mode, or EXC-2, D8).

---

### User Story 4 - Readable internal dependencies, checked automatically (Priority: P2)

A developer adding a feature can identify the real dependencies between
domains; no dependency loop exists between the domains cited by the audit, and an
automatic check prevents reintroducing any. The reported dead code and duplicates have
disappeared, and any divergence between the statuses known to the server and those of the interface
is detected before delivery.

**Why this priority**: improves maintainability without changing visible behavior; must
follow US1 (green suite) so that non-regression is provable.

**Independent Test**: run the automatic dependency check and the full suite;
compare functional behavior before and after (no functional test changed in its
expectations).

**Acceptance Scenarios**:

1. **Given** the code after the fix, **When** the dependency check runs,
   **Then** it finds no cycle between the requests, files, authentication,
   audit and common base domains. The split of the real-time module (connection registry on one
   side, authenticated gateway on the other) is kept and documented as an intended split,
   not as a workaround (see research R7).
2. **Given** a developer who deliberately introduces a cycle between these domains, **When** the
   check runs, **Then** it fails, naming the files concerned.
3. **Given** a file attached to a request or an attendance proof of class
   coverage, **When** a user tries to read it, **Then** access decisions are
   identical to those before the fix (same authorizations, same logged refusals), and
   file storage no longer contains any rule specific to a business domain.
4. **Given** a status added or renamed on the server side, **When** the quality checks
   run, **Then** they fail as long as the interface does not know this status.
5. **Given** the repository, **When** one searches for the unused notification publisher, the
   unused icons dependency or the multiple declarations of the rules loader, **Then**
   none is found, and the operations scripts follow the formatting convention.

---

### User Story 5 - Go to production safely (Priority: P3)

The operator has a verified production procedure: a backup is guaranteed
before any migration, restore has been tested, security headers and size
limits have been checked on a real deployment, and all the quality checks are replayed
before each delivery.

**Why this priority**: essential before production, but does not block development;
several points depend on human decisions (A21, A27).

**Independent Test**: run the procedure on a staging server, including a full
restore and a deliberately faulty migration.

**Acceptance Scenarios**:

1. **Given** a new version containing a migration, **When** the operator deploys it,
   **Then** a dated backup of the database and files exists before the migration is applied,
   otherwise the deployment stops before touching the database.
2. **Given** a faulty migration, **When** it fails, **Then** the database stays in its
   previous state or can be restored from the previous backup, and the rollback
   procedure is documented and has been exercised.
3. **Given** a real backup, **When** the operator restores it on a blank server,
   **Then** the application restarts with the requests, voice messages, photos and audit log
   intact, and the restore duration is recorded.
4. **Given** a real HTTPS deployment, **When** the responses are checked, **Then** the
   content security policy, HSTS and the upload size limit are present and
   compliant, and the result is recorded.
5. **Given** a candidate delivery, **When** the quality checks are replayed (lint, unit
   tests, integration, end-to-end, performance, dependency audit), **Then** all
   pass and the results are recorded, automatically or manually according to FR-019.

---

### Edge Cases

- A developer already has a local configuration file with the old port 3000: the README
  MUST say how to align it; the interface must not fail silently: with the API
  stopped, the development proxy answers 502 with no JSON body and the interface shows « Une
  erreur inattendue est survenue. Réessayez plus tard. » (An unexpected error occurred. Try again later.); with no response at all, it shows
  « Connexion impossible. Vérifiez votre connexion internet puis réessayez. » (Unable to connect. Check your internet connection and try again.). These
  existing messages are kept (FR-023) and verified by an automated test.
- Port 3002 is already in use on the workstation: the launcher stops with an explicit message
  (current behavior to keep).
- Resetting a super administrator's password while the database is unreachable:
  the operation fails entirely, with no partial password change or orphan audit entry.
- Several requests awaiting approval at the time of a category change: the rule
  of FR-008 applies to each, independently.
- Request submitted **before** the assignment fix is deployed: its snapshot contains
  the assignment mode but not the designated person; exception EXC-1 of FR-008 (decision D9).
- Removal of the unused publisher or the duplicated loader while a test uses it
  indirectly: the full suite must stay green, otherwise the removal is cancelled.
- Backup impossible before migration (disk full): the deployment stops and the old
  version keeps working.

## Requirements *(mandatory)*

### Functional Requirements

Each requirement indicates the findings it addresses. Number FR-022 is not used here, to
avoid any confusion with FR-022 of the phase 1 specification, still cited as "FR-022 (phase 1)".

**Configuration and development environment**

- **FR-001** (A01): All configuration and documentation sources of the development
  environment (example configuration, README, development HTTPS proxy, launcher,
  tests) MUST designate the same API port, 3002.
- **FR-002** (A01): The production configuration MUST explicitly set the internal port of
  the API; it MUST NOT depend on the development default value. The current production
  port (3000, internal to the container network) MAY be kept.
- **FR-003** (A02): The development launcher MUST start the API in reload mode, or
  else the README and the launcher MUST state and perform the required build step; the
  two documents MUST NOT contradict each other.
- **FR-004** (A07): All environment variables read by the API, including the trust
  in the proxy and the port, MUST be validated at startup by the same step; an
  invalid value MUST prevent startup with an explicit message.

**Security and traceability**

- **FR-005** (A06): The application logs and the audit log MUST mask the same
  set of sensitive keys, defined in a single place and covering at least the union of the two
  current lists (including the authorization header and the content of messages).
- **FR-006** (A08): The origin check MUST be defined once and applied identically
  to modifying HTTP requests and to real-time connections.
- **FR-007** (A05): Any reset of a super administrator's password by an operations
  tool MUST create an entry in the tamper-proof audit log, close all their
  sessions and require a password change at the next login, in the same way
  as the existing initialization tool logs its actions.

**Automatic assignment and FR-022 (phase 1)**

- **FR-008** (A03, A04): When approving a request in workflow B with automatic
  assignment, the assignment mode **and** the designated person MUST be those frozen in the
  request's snapshot at its submission, in accordance with FR-022 (phase 1); a later
  change to the category MUST NOT change the assignment of an already submitted request
  (decision D1, 2026-10-15). An employee proposed by the manager while the frozen person
  is assignable is ignored. Only two exceptions exist, both validated:
  - **EXC-1 — request predating the fix** (decision D9): if the snapshot does not contain
    the designated person's key, that person is read from the current configuration of the
    category; the mode stays that of the snapshot;
  - **EXC-2 — frozen person not assignable** (decision D8): see FR-011.
  The source of the assignment (snapshot, current category, manager's choice) MUST be
  recorded in the request's history.
- **FR-009** (A04): Before any fix, an automated test MUST reproduce the current behavior
  (category change between submission and approval), in order to confirm finding
  A04 [INFERRED]; the fix MUST then make this test pass according to FR-008.
- **FR-010** (A05): The super administrator password reset MUST be a
  subcommand of the existing initialization tool, compliant with FR-007; the separate script MUST
  be deleted and the operations documentation updated (decision D2, 2026-10-15).
- **FR-011** (A03): If the person to assign according to FR-008 (frozen, or read according to EXC-1) is
  inactive or is no longer a recipient of the category at approval, an approval without a
  chosen employee MUST be refused with a message inviting the manager to choose the employee,
  with no write at all. The manager MAY then approve by choosing an assignable employee
  (active and recipient of the category); no non-assignable account MUST be
  assigned (decision D8).

**Dependencies between modules and technical debt**

- **FR-012** (A09, A12): There MUST be no dependency cycle between the requests,
  files, authentication, audit and common base domains; the cross-cutting rules (permissions by
  role, administration and audit rights) MUST be placed outside the requests domain.
- **FR-013** (A09): An automatic check for dependency cycles MUST be part of the
  project's quality checks and fail by naming the files involved.
- **FR-014** (A10, A11): File storage MUST NOT contain any access rule specific to a
  business domain; each domain MUST provide its own access decision for its files. The
  observable access decisions (authorizations, refusals, logging of refusals) MUST remain
  identical, proven by the existing tests unchanged in their expectations.
- **FR-015** (A13, A15, A16, A18, A19): The category rules loader MUST be declared
  once and shared; the class coverage deadlines job MUST be placed with the
  other scheduled tasks; the unused publisher, its outdated comment and the unused
  icons dependency MUST be removed; the operations scripts MUST follow the
  project's formatting convention.
- **FR-016** (A17): Any divergence between the statuses, priorities and other enums of the
  server contract and those of the interface MUST be detected automatically by the
  quality checks; the announcement of generated types that do not exist MUST be removed or made
  true.

**Tests and production readiness**

- **FR-017** (A01, A20, A26): Before closing this feature, lint and the unit,
  integration, end-to-end and performance tests MUST be run and pass;
  the results MUST be recorded in `docs/validation/`, as for the final verification
  of phase 1.
- **FR-018** (A22, A23): The deployment MUST guarantee the existence of a backup of the database and
  files, dated and later than the last data change, before any
  migration is applied; failing that, it MUST stop before touching the database.
- **FR-019** (A21): The quality checks MUST be replayed before each delivery
  (decision D3, 2026-10-15):
  - automatically, on every push to the remote repository and every pull request: lint,
    unit, interface and integration tests, dependency audit; a failure MUST be
    visible on the pull request;
  - manually before each delivery: end-to-end and performance tests, with a
    dated report in `docs/validation/`;
  - manually before each merge into `master` (decision D10): the person who merges
    MUST verify and tick the CI result on the latest commit, the execution of the required
    tests, the absence of unresolved failure and the diff review, following a documented procedure;
    an unsatisfied check forbids the merge. This procedure is manual and DOES NOT constitute
    a technical protection: as long as branch protection is not available,
    GitHub does not prevent a merge whose tests fail.
- **FR-020** (A24): The restore procedure MUST be exercised at least once on a
  blank server from a real backup, and the result (success, duration, gaps)
  recorded.
- **FR-021** (A25): The security headers (content security policy, HSTS) and the upload
  size limit MUST be checked on a real HTTPS or staging deployment,
  and the result recorded.
- **FR-023**: No fix MUST change the functional behavior visible to
  users, except for the assignment rule of FR-008 (with its exceptions EXC-1 and
  EXC-2), the refusal and manager's choice described in FR-011, the mention of the assignment
  source in the history, and the order in which events with the same timestamp are returned
  (FR-025).
- **FR-024** (A01–A35): `docs/ARCHITECTURE.md` MUST be updated at the end of the
  feature: each finding handled is marked as fixed with its reference, each
  [INFERRED] finding confirmed or refuted is re-marked [VERIFIED] or removed.
- **FR-025** (N3, noted by the first CI run): the history of a request
  (work request or class coverage) MUST return events in their write order,
  including those written in the same millisecond; this order MUST NOT depend
  on a random identifier. An automated test MUST verify it deterministically.

### Decisions requiring human validation

These points ARE NOT final requirements until they are settled. D1 to D3 have been
settled (see Clarifications), as well as D8, D9 and D10; D4 to D7 remain open and out of
scope.

| ID | Decision | Findings | Who | Effect on this feature |
|----|----------|----------|-----|--------------------------------|
| D1 | Automatic assignment rule at approval | A03, A04 | Project lead | **Settled on 2026-10-15**: everything frozen at submission (FR-008). To be confirmed by the school, without blocking implementation |
| D2 | Fate of the super administrator reset tool | A05 | Project lead | **Settled on 2026-10-15**: subcommand of the initialization tool (FR-010) |
| D3 | Automatic continuous integration or manual procedure | A21 | Project lead | **Settled on 2026-10-15**: CI for lint and fast tests, manual for end-to-end and performance (FR-019) |
| D4 | Retention periods for personal data and automatic purge | A27 | School (GDPR) | Out of scope; no purge will be implemented without a decision |
| D5 | Phase 2 specification (class coverage: statuses, 2 and 5 min deadlines, proofs) | A32 | School | Out of scope; FR-014 changes no phase 2 rule |
| D6 | Other provisional values of the README "À trancher" (To be decided) section (permissions by role, deadlines, recipients, read receipt) | §11.10 | School | Out of scope; no value changed |
| D7 | Origin of the technical choices (stack imposed or proposed) | §6, §11.1 | Project lead | None; documentary information |
| D8 | What follows a refusal when the frozen person is no longer assignable | A03 | Project lead | **Settled on 2026-10-15**: the manager chooses an assignable employee (FR-011, exception EXC-2) |
| D9 | Rule for earlier requests with no frozen person | A03, A04 | Project lead | **Settled on 2026-10-15**: current category, traced in the history (FR-008, exception EXC-1) |
| D10 | Guarantee "no merge if the suite fails" without branch protection | A21 | Project lead | **Settled on 2026-10-15**: the GitHub repository stays private, with no paid subscription; automatic branch protection postponed; CI kept; mandatory manual check before every merge (FR-019), which is not a technical protection |

### Out of scope

- Merging the two state machines, access policies and deadline computations (A29): major
  structural change, to be justified in a dedicated feature (principle II).
- Splitting large services (A30) and reducing global modules (A31), except what
  FR-012 requires.
- Multi-instance operation of the API (A28), error tracking and metrics (A33), replacement
  of the embedded development database (A34).
- Manual validations of phase 1 (A35: tasks T119 and T120).

### Key Entities *(include if feature involves data)*

- **Audit finding**: register item (ID, summary, source section, marking [VERIFIED] /
  [INFERRED], class CT / DH / HP, processing status).
- **Frozen assignment rule (snapshot)**: copy of a category's rules kept with the
  request at its submission; it includes the assignment mode **and** the designated person
  (decision D1). A snapshot predating the fix, without the designated person, falls under
  exception EXC-1 (decision D9).
- **Operations audit entry**: tamper-proof trace of an action done outside the interface
  (operations tool), with action, target, date and origin.
- **Verification report**: recorded result of a run of the quality checks, of a
  restore or of a security headers check (date, environment, results).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer who follows only the README starts the application and logs in
  in under 10 minutes (excluding downloads), without modifying any repository file.
- **SC-002**: 100% of tests pass in each of the suites: unit, integration, end-to-end,
  interface, performance; lint reports no problem; no vulnerability of
  high or critical severity.
- **SC-003**: No mention of a port other than 3002 remains in the development configuration and
  documentation.
- **SC-004**: 100% of super administrator password resets produce an
  audit entry and close all their sessions (verified by test).
- **SC-005**: For each of the assignment test cases (person change, mode
  change, person deactivated or removed from the recipients, earlier request), the assigned
  person and the recorded source are those provided by FR-008 and FR-011 (decisions D1, D8,
  D9) in 100% of cases.
- **SC-006**: Zero dependency cycles between the cited domains, and deliberately introducing
  a cycle makes the quality checks fail.
- **SC-007**: The existing file and request access tests pass without any change
  to their expectations.
- **SC-008**: A full restore on a blank server has succeeded at least once, with a
  recorded duration; the security headers checks are recorded as compliant.
- **SC-009**: 100% of the register's CT findings are marked fixed in
  `docs/ARCHITECTURE.md`, and each [INFERRED] finding handled is confirmed or refuted.

### Status of criteria (as of 2026-10-16, task T062)

- [ ] **SC-001** — open: timed path on a Windows workstation still to do (T013).
- [x] **SC-002** — reached on 2026-10-22 (T058, T061): lint, unit tests (572),
  integration (599, including search performance), interface (229) and end-to-end
  (143 passed, 0 failed) at 100%, no high or critical vulnerability
  (`docs/validation/verification-003.md`).
- [x] **SC-003** — reached: verified by `dev-port-consistency.spec.ts`.
- [x] **SC-004** — reached: verified by `bootstrap-production.spec.ts` (`resetSuperAdminPassword`).
- [x] **SC-005** — reached for the automated cases (`auto-assignment-snapshot.spec.ts`); the
  manual run of scenario 4 is still to do (T032).
- [x] **SC-006** — reached: `architecture-layers.spec.ts` green, counter-test recorded (T048).
- [x] **SC-007** — reached: file and request suites green with no change of expectations.
- [ ] **SC-008** — open: restore and headers to verify on staging (T056, T057).
- [ ] **SC-009** — partial: fixed findings marked with their commit (`docs/ARCHITECTURE.md`
  §12); A23 to A26 remain to be confirmed or refuted on staging (T055 to T058).

## Assumptions

- Development port 3002 is settled: it was committed on 2026-10-15 (`1e6d4ee`). The internal
  production port stays 3000, explicitly set by the deployment.
- The `docs/ARCHITECTURE.md` report is accurate as of its commit date; no finding is
  re-audited, only the [INFERRED] findings are confirmed when they are handled.
- The feature is developed on a branch derived from `002-refonte-ui-destinataires`, because
  it fixes code from that phase (class coverage). Number 003 was chosen to leave
  number 002 to a possible phase 2 specification (D5).
- The application runs on a single instance (A28); the fixes do not have to make the API
  multi-instance.
- A single schema migration is planned: the addition of the write order of history
  events (FR-025, N3). It only adds a column; the table stays append-only.
- No backfill of existing snapshots is planned: earlier requests fall under
  exception EXC-1 (decision D9).
- Decisions D1, D8 and D9 were made by the project lead; they remain to be
  confirmed by the school, without blocking implementation.
- The GitHub repository stays private, on the free plan (decision D10): branch protection
  is not available there [VERIFIED on 2026-10-15]. If the plan changes, protection of `master`
  can be enabled (research R11) with no other change to this feature.
- The operations tools are used by a person with access to the server; they remain
  outside the web interface.
- The staging or production server needed for FR-020 and FR-021 will be provided by
  the operator; failing that, these requirements remain open and the feature cannot be
  declared ready for production.
- No new personal data is collected: the operations audit entry contains
  only the identifier of the targeted account and the origin of the action.

## Personal data

This feature collects no new personal data. It strengthens the masking of
secrets and message content in the logs (FR-005). Retention periods
remain the provisional ones of phase 1 (D4).
