# Research: Section « Surveillance » (012)

No item of the Technical Context was left as NEEDS CLARIFICATION: the stack is the existing one and the
user's answers of 2026-11-08 settle the scope. The decisions below come from reading the code
(`frontend/src/features/coverage/CoveragePage.tsx`, `ManagerViews.tsx`,
`frontend/src/features/attendance/AttendanceFollowUpTab.tsx`).

## R1 — What « Absences et retards » shows

- **Decision**: the tab renders the current « Présences » component (`AttendanceFollowUpTab`) unchanged.
- **Rationale**: it already holds exactly the signals the spec lists: « Suivi des présences » (clock-ins of
  the day, regularisation), « Retards et absences annoncés » (teachers' reports) and « État des classes »
  (empty classes and class events). It already states that a missing scan is never an absence (FR-004).
- **Alternatives considered**: also listing the waiting teacher reports from the coverage queue
  (rejected: duplicates « Retards et absences annoncés » and the « Affectation » tab).

## R2 — « Affectation des surveillants »: one tab, three stacked parts

- **Decision**: a new `AssignmentTab` stacks, in this order: a « Nouvelle affectation » button, the waiting
  queue (`ManagedCoverageTab scope="pending"`, unchanged order from the server), the duplicates
  (`MergeProposalsTab`) and the team (`TeamTab`). Each part gets a heading (`h2`): « À assigner »,
  « Doublons possibles », « Équipe », with an `id` (`a-assigner`, `doublons`, `equipe`) so a link can target
  it.
- **Rationale**: reuses the three existing components as they are; no server change; headings keep the
  page navigable by screen-reader heading list.
- **Alternatives considered**: nested sub-tabs (rejected: tabs inside tabs, worse on 320 px and for
  keyboard users); hiding empty duplicates (rejected: the empty message « Aucun doublon à trancher » tells
  the admin there is nothing to do).
- « Nouvelle affectation » leaves the page header for admins (it belongs to this tab, spec assumption);
  « Statistiques » and « Déclarer une classe vide » stay in the header.

## R3 — « Suivi des interventions »: three filters mapped on the existing scopes

- **Decision**: a new `TrackingTab` with an exclusive `ToggleButtonGroup` (« En attente », « Prise en
  charge », « Terminée »), default « Prise en charge », rendering `ManagedCoverageTab` with the existing
  scopes `pending`, `active`, `finished`.
- **Rationale**: the three scopes already query exactly the statuses of the spec:
  `mainStatus=PENDING`; `mainStatus=ASSIGNED&mainStatus=IN_PROGRESS`;
  `mainStatus=DONE&mainStatus=CANCELLED&mainStatus=UNFILLED` (SC-003 holds by construction). Rows are the
  same `CoverageRows`, so precise statuses and alerts stay (FR-007).
- **Default « Prise en charge »**: what is under way is what one follows; « En attente » is handled in
  « Affectation des surveillants ».
- **Alternatives considered**: MUI `Tabs` for the filter (rejected: tabs inside tabs); a `Select`
  (rejected: hides the three choices behind a click); chips (no existing pattern in the project;
  `ToggleButtonGroup` is already used by `LanguageSwitcher`, announces `aria-pressed`).

## R4 — Addresses: tab and filter in the query string, former keys mapped

- **Decision**: keep `?onglet=` with new keys `absences-retards`, `affectation`, `suivi`; add `?filtre=` with
  `en-attente`, `prise-en-charge`, `terminee`. Former admin keys are mapped when read:

  | Former `onglet` | New `onglet` | `filtre` |
  |---|---|---|
  | `presences` | `absences-retards` | — |
  | `en-attente` | `affectation` | — |
  | `doublons` | `affectation` | — (heading `#doublons`) |
  | `equipe` | `affectation` | — (heading `#equipe`) |
  | `en-cours` | `suivi` | `prise-en-charge` |
  | `terminees` | `suivi` | `terminee` |

  The address is rewritten to the new keys (`replace`, no history entry). Teacher and supervisor keys
  (`mes-signalements`, `mes-presences`, `mes-affectations`, `historique`) are unchanged.
- **Rationale**: FR-008; in-app links still use the former key `?onglet=doublons`
  (`CoverageDetailPage.tsx:287`) and are updated to `?onglet=affectation#doublons`; bookmarks keep working.
- **Paths unchanged**: `/gardes`, `/gardes/:id`, `/gardes/nouvelle`, `/gardes/presence`… The QR URL is built
  by the server (`coverage-admin.service.ts:326`, `/gardes/presence?c=…`) and printed on paper (FR-002).

## R5 — Renaming

- **Decision**: `t('Gardes')` → `t('Surveillance')` (menu `AppLayout.tsx:91`, back links in
  `CoverageDetailPage`, `CoverageStatsPage`, `CreateCoveragePage`, tablist label), `t('Gardes de classe')` →
  `t('Surveillance')` (page title). English dictionary: « Surveillance » → « Supervision »; former keys
  removed when no longer used (the dictionary test forbids missing keys, not unused ones; unused keys are
  removed to keep it tidy). Tab panel id `panneau-gardes` → `panneau-surveillance`.
- **Out of scope** (spec assumption): category names, notifications, « Suivi des gardes » in
  « Administrateur », code identifiers (`coverage`, `/gardes`).

## R6 — Tests that encode the former layout (changed first, documented exception)

Confirmed with `grep` on tab names, former `onglet=` keys and « Gardes »:
`frontend/tests/coverage/coverage.test.tsx` (tab list ≈ l.266–279), `admin-queue.test.tsx` (≈ l.99),
`admin-duplicates.test.tsx` (`?onglet=doublons`, `?onglet=en-cours`, ≈ l.180, 206),
`frontend/tests/attendance/attendance.test.tsx` (« Présences », ≈ l.465), `frontend/tests/app/home.test.tsx`
(menu « Gardes », ≈ l.85), `e2e/attendance-qr.spec.ts` (≈ l.103–104), `e2e/coverage-class.spec.ts`
(≈ l.183, 285, 323, 493), `e2e/a11y-responsive.spec.ts` (title « Gardes de classe » and former keys,
≈ l.171–201). Expectations on tab names and the « Gardes » label change; expectations on content, order,
statuses and rights stay.

Not affected (same words, other meaning): `frontend/tests/admin/dashboard.test.tsx` (a category named
« Gardes », KPI « Terminées »), `status-badges.test.tsx` and `e2e/us5-admin-validation.spec.ts` (status
labels « En attente », « En cours » on rows), `direct-assignment.test.tsx` (heading of the
« Nouvelle affectation » page).
