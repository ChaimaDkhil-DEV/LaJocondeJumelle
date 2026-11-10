# Feature Specification: Teacher home page — quick actions and request tracking (Accueil de l'enseignant)

**Feature Branch**: `016-accueil-enseignant`

**Created**: 2026-11-10

**Status**: Implemented (pending review)

**Input**: User description (summary): "Modifier l'interface et le comportement de l'espace Enseignant pour
proposer un accueil centré sur les actions rapides et le suivi des demandes : un grand bouton central
« Scanner un QR code » (scanner existant, caméra ouverte au clic) ; dessous, « Demande urgente » (rouge,
URGENT) et « Demande normale » (jaune, NORMAL), chacun ouvrant le formulaire d'enregistrement vocal avec la
priorité préremplie ; ne conserver que deux priorités métier, URGENT et NORMAL, partout (formulaires,
validations, filtres, affichages, statistiques, règles serveur), avec une migration des données existantes ;
une section « Suivi de mes demandes » de trois vrais boutons (En attente, Validées / traitées, Archives) avec
icône, titre, descriptif, compteur dynamique et chevron, chacun ouvrant la liste filtrée des demandes de
l'enseignant connecté."

## Context

Before 016, a teacher (an `EMPLOYEE` in the « Enseignants » system group) landed on « Mes demandes », a list
with tabs. Scanning the class QR code was two levels down (« Surveillance » › « Mes présences »), and the
request form offered four priorities (Normale, Moyenne, Haute, Urgente).

## User Scenarios & Testing

### User Story 1 — Scan the class QR code from the home page (P1)

The teacher opens the application: the home page shows a large « Scanner un QR code » button. One tap opens
the existing in-app QR reader (camera requested immediately); a class QR leads to the existing arrival
confirmation page (`/gardes/presence?c=…`). Photo and pasted-link fallbacks are unchanged.

### User Story 2 — Urgent or normal request in one tap (P1)

Under the scanner, two side-by-side buttons: « Demande urgente » (soft red) and « Demande normale » (soft
yellow). Each opens the existing voice-first request form (`/demandes/nouvelle?priorite=URGENT|NORMAL`) with
the priority already checked. The page title (« Demande urgente » / « Demande normale ») and a « Priorité : … »
badge restate the priority and follow any change made in the form; automatic suggestions never override it
(it counts as a user choice). An unknown or retired value in the address (`?priorite=HIGH`) is ignored.

### User Story 3 — Track my requests (P1)

A « Suivi de mes demandes » section shows three large horizontal link-buttons, whole surface clickable:

| Button | Colour | Statuses (server side) |
| --- | --- | --- |
| En attente | orange | `PENDING_ADMIN_VALIDATION`, `SENT`, `ACCEPTED`, `IN_PROGRESS`, `TO_CORRECT`, `PENDING_FINAL_VALIDATION` |
| Validées / traitées | green | `DONE` |
| Archives | grey | `CLOSED`, `REJECTED`, `CANCELLED` |

Each has an icon, a title, a short description, a live counter and a chevron, and opens
`/demandes/suivi/en-attente|traitees|archives`, the list of the teacher's own requests in that group.
Counters are recomputed whenever request lists are invalidated (real-time `request:updated` and
`notification:new` events, actions on a request, window focus).

### User Story 4 — Two business priorities everywhere (P1)

Only `NORMAL` and `URGENT` exist: request form, priority change dialog, list filters, dashboard filters and
« Délais par priorité », deadline rules per category, AI suggestions (demo provider and Claude schema), assist
tokens, seeds and demo data. The API rejects `MEDIUM` and `HIGH` (400).

### Acceptance (tests)

- `backend/test/unit/request-tracking.spec.ts` — every sent status belongs to exactly one group.
- `backend/test/integration/requests-tracking.spec.ts` — counters and lists limited to the user's own WORK
  requests, drafts excluded, unknown group refused, update after a status change, 401 without session.
- `backend/test/integration/migration-0024.spec.ts` — data conversion, history, audit, rollback, re-apply.
- `backend/test/integration/history-priority.spec.ts`, `requests-search.spec.ts`, `admin-categories.spec.ts`
  — retired priorities refused.
- `frontend/tests/app/teacher-home.test.tsx`, `frontend/tests/requests/CreateRequestPage.test.tsx`,
  `RequestFilters.test.tsx`, `HistoryTimeline.test.tsx`, `outbox-priorities.test.ts`.
- `e2e/teacher-home.spec.ts` — axe, no horizontal scroll (320 px project included).

## Decisions (all validated by the user on 2026-11-10: D2 changed as described, D1, D3, D4, D5 as proposed)

- **D1 — Migration mapping**: `MEDIUM → NORMAL`, `HIGH → URGENT` (a « Haute » request keeps its pressing
  character; over-alerting is safer than losing an urgent case). Running deadlines are **not** recomputed
  (rules snapshot and due date kept), so no request becomes overdue because of the migration.
- **D2 — Tracking groups** (decided by the user, 2026-11-10): `ACCEPTED` is in « En attente », with
  `IN_PROGRESS` and `TO_CORRECT` (being processed); « Validées / traitées » holds `DONE` only. A request
  therefore no longer goes back from green to orange when work starts (only a correction requested after
  `DONE` brings it back to « En attente »). The mapping is one constant, `TRACKING_GROUPS`
  (`backend/src/requests/domain/tracking.ts`).
- **D3 — Who gets the teacher home**: `EMPLOYEE` members of the « Enseignants » group. An admin who is also a
  teacher keeps « Mes demandes » (validation tabs); the super administrator keeps the dashboard.
- **D4 — No automatic focus** on the record button (`jsx-a11y/no-autofocus`): the form opens with the voice
  recorder as its first field.
- **D5 — Legacy values**: history (`RequestEvent`, append-only) still mentions « Moyenne » / « Haute »; they are
  displayed with their old label. Old guidelines saying « Priorité : Moyenne / Haute » are read as Normale /
  Urgente by the demo suggestion provider. Outbox entries saved offline before the update are converted
  with the same mapping when read.

## Data model

- `enum Priority { NORMAL URGENT }` (was `NORMAL MEDIUM HIGH URGENT`), used by `Request.priority`,
  `DeadlineRule.priority` and `Notification.priority`.
- Migration `0024_two_priorities` (one implicit transaction):
  1. one `RequestEvent` `PRIORITY_CHANGED` per converted request (actor SYSTEM, comment `migration-0024`,
     `fromValue`/`toValue` with priority and due date);
  2. one `AuditLog` `DEADLINE_RULE_CHANGED` per category with retired rules (`details.before` = the 4 rules,
     `details.after` = the 2 kept, `details.migration = '0024_two_priorities'`);
  3. conversion of `Request` (version + 1, `updatedAt`) and `Notification`, deletion of the `MEDIUM`/`HIGH`
     deadline rules;
  4. enum swap.
- `down.sql` restores the 4-value enum, the original priority of each converted request not changed since
  (adding a `migration-0024-down` event), and the `MEDIUM`/`HIGH` deadline rules from the audit log (default
  durations for a category created after the migration). Notifications stay `NORMAL`/`URGENT`.
- No new table, no new personal data. New endpoint: `GET /api/requests/tracking` →
  `{ pending, handled, archived }`; `GET /api/requests` accepts `tracking=pending|handled|archived`.

## Constitution Check

- **I. TDD** — tests written first for every new behaviour (see Acceptance); existing expectations changed
  only where they encoded the retired priorities (listed in the PR).
- **II. Simplicity** — no new dependency, table or service; the scanner (`QrScannerDialog`), the voice form
  (`CreateRequestPage`/`RequestFields`) and the request list rows (`RequestRows`) are reused.
- **III. Accessibility** — real links/buttons, names « En attente 3 demandes » with the description as
  `aria-describedby`, visible focus, hover/active states, reduced motion respected, axe checks (e2e), 320 px.
- **IV. Security** — server-side validation (`IsEnum(Priority)`, `IsIn(TRACKING_GROUP_NAMES)`); counters and
  lists always limited to `requesterId = current user` within `visibleRequestsWhere`.
- **V. Integrity** — finite statuses unchanged; every migrated request change is recorded in its history and
  every removed deadline rule in the audit log; rollback is traced too.
