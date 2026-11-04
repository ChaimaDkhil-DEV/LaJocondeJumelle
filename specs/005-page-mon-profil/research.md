# Research — 005 Page « Mon profil » (My profile page)

No technical unknown: the feature reuses the stack, authentication, the password change page and
the existing components. The decisions below fix the design choices based on the code of
`master` (`dafec78`).

## R1 — Source of the profile information

- **Decision**: add `username` and `jobTitle` (`string | null`) to the existing
  `GET /api/auth/me` response (and `POST /api/auth/login`, which returns the same `MeResponse`
  type). The groups already come from `isTeacher` and `isSupervisor`.
- **Rationale**: the session already loads the full user row
  (`session.service.ts`, `include: { user: true }`); `username` is already in
  `AuthenticatedUser`, `jobTitle` is added with no extra query. The profile reuses the
  `useCurrentUser` cache, already loaded on all pages. Both fields concern only the signed-in
  account, which already knows them: no new exposure of personal data.
- **Alternatives considered**: new endpoint `GET /api/auth/profile` (one more route, access
  control and cache for two fields: rejected, principle II); reading through
  `/api/admin/users/:id` (reserved to the super administrator: impossible for the other roles).

## R2 — Route and location of the page

- **Decision**: new route `/profil`, child of `AppLayout` (hence behind `RequireAuth`),
  page `frontend/src/features/auth/ProfilePage.tsx`.
- **Rationale**: `RequireAuth` already redirects to `/mot-de-passe` while the change is
  forced: the profile is unreachable in that case with no extra code (spec edge case). The
  menu and the mobile drawer stay available on the page.
- **Alternatives considered**: page outside the layout like `/mot-de-passe` (loses the menu: rejected).

## R3 — Profile block link (desktop and mobile drawer)

- **Decision**: the `Person` block (name and role) becomes the content of a link to `/profil`,
  preceded by a visually hidden text « Mon profil : ». Accessible name:
  « Mon profil : <nom> <rôle> ». The link closes the mobile drawer, like the menu entries.
- **Rationale**: the accessible name contains the visible text (WCAG 2.5.3 "Label in Name"),
  which an `aria-label` replacing the content does not guarantee. A single `user` element is
  already shared by the sidebar and the drawer: a single change.
- **Alternatives considered**: one more « Mon profil » entry in the main navigation
  (visual duplicate of the existing block: rejected); `aria-label` alone (Label in Name risk: rejected).

## R4 — Voluntary password change flow

- **Decision**: the existing `/mot-de-passe` page chooses its mode from
  `me.mustChangePassword` (server state):
  - forced (`true`): unchanged, no cancel, success → home (`/`);
  - voluntary (`false`): « Annuler » (Cancel) button → `/profil`; success → `/profil` with a
    confirmation message (announced status) stating that the other sessions are closed.
- **Rationale**: the mode depends on the account state, not on a URL parameter that could be
  manipulated to avoid the forced change. No server rule changes: current password
  verification, 12 characters, closing of other sessions and audit `PASSWORD_CHANGED`
  already exist (`auth.service.ts`).
- **Alternatives considered**: form embedded in the profile page (duplicates the page and its
  tests: rejected); `?depuis=profil` parameter (manipulable, useless: rejected).

## R5 — Server message « Changer mon mot de passe » (FR-013)

- **Decision**: the profile page's action carries exactly the label « Changer mon mot de
  passe » (Change my password), the one in the refusal message of `users.service.ts`; the message is not modified.
- **Rationale**: the message becomes accurate as soon as the action exists; no server change.

## R6 — Test strategy (principle I)

- **Backend unit**: `toMeResponse` returns `username` and `jobTitle` (`null` if absent).
- **Backend integration** (`backend/test/integration/auth.spec.ts`): `GET /api/auth/me` returns
  `username` and `jobTitle` of the signed-in account, and only its own.
- **Frontend (Vitest + Testing Library)**: new suite `frontend/tests/auth/profile.test.tsx`
  (page content, labels « Non renseignée » / « Aucun », no editable field, link
  « Changer mon mot de passe »); voluntary and forced flows of `ChangePasswordPage`
  (cancel, return to the profile, confirmation, forced mode unchanged); profile block link.
- **End to end**: new Chromium test in `e2e/auth.spec.ts`: open the profile from the
  menu, change the password of a demo account, verify the closing of another
  session and sign-in with the new password, then **restore the old one** to leave
  the e2e database replayable (same principle as the assignment flows). Addition of the
  « Mon profil » page to V18 (`e2e/a11y-responsive.spec.ts`, 320 px, axe).
- **Type synchronization**: `Me` (frontend, hand-written) receives the two fields; the existing
  `enums-sync.test.ts` check covers enumerations, not `Me`: nothing to
  add.
