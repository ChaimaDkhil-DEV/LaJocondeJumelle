# Feature Specification: Page « Mon profil » (My profile page) and access to the password change

**Feature Branch**: `005-page-mon-profil`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "« Mon profil » page for any signed-in user (employee, admin,
super administrator). Today the side menu's profile block displays only the name and
role, with no link or page; the password change exists (forced at first sign-in,
closes the other sessions) but no link leads to it, even though the server refers to it in its
refusal message (« Utilisez « Changer mon mot de passe » pour votre propre compte » (Use "Change my password" for your own account)). Need:
the profile block becomes a link to a « Mon profil » page that displays the account information
read-only (name, identifier, job title, role, membership of the
Surveillants/Enseignants (Supervisors/Teachers) groups where applicable) and offers « Changer mon mot de passe ». Keyboard
accessible, WCAG 2.2 AA, mobile (320 px) and desktop. Out of scope: changing the name or
job title by the user themselves (stays with the administration), profile picture."

## Contexte (Context)

- The menu's profile block (name and role) is neither a link nor a button; no profile page
  exists (`docs/superadmin-fonctionnalites.md` §4.2).
- The password change already exists: dedicated page, current password then new password (at least
  12 characters) and confirmation; it closes the account's other sessions. It
  is reached only at first sign-in (forced): no link leads to it afterwards.
- The server sends a super administrator who tries to reset their own password
  to « Changer mon mot de passe », which cannot be found in the interface.
- This feature **creates nothing new on the rules side**: it makes existing account
  information visible and makes an existing flow accessible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change your password when you want to (Priority: P1)

A signed-in user (employee, admin or super administrator) wants to change their password,
for example because they think it was seen. From the menu, they open their profile, choose
« Changer mon mot de passe », enter the current one then the new one, and return to their profile with
confirmation that the change is done and that their other sessions have been closed.

**Why this priority**: this is the gap with a security consequence: today, a
user can change their password only if the administration resets it. The server's message
points to a link that does not exist.

**Independent Test**: sign in, open the profile from the menu, change the password,
sign out then sign in again with the new password; a session open in another
browser is closed.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they activate the menu's profile block, **Then** the
   « Mon profil » page opens and offers « Changer mon mot de passe ».
2. **Given** the « Mon profil » page, **When** they choose « Changer mon mot de passe », enter their
   current password and a valid, confirmed new password, **Then** the password is
   changed, they return to « Mon profil » with a confirmation message stating that their
   other sessions have been closed, and they stay signed in in the current browser.
3. **Given** the change form opened from the profile, **When** they choose
   « Annuler » (or go back), **Then** they return to « Mon profil » with no change.
4. **Given** the form, **When** the current password is wrong, or the new one too short, or
   the confirmation different, **Then** a clear message, tied to the relevant field, says so and
   nothing is changed.
5. **Given** a user whose change is **forced** (first sign-in or reset password),
   **When** they sign in, **Then** the current flow is unchanged: the change page
   is imposed, with no way to avoid it, and leads to the home page once the change is
   done.

---

### User Story 2 - View your account information (Priority: P2)

A user wants to check which identifier they sign in with, which role and job title
were assigned to them, and whether they are among the supervisors or teachers (which determines
what they see in « Gardes » (Duty shifts)). They open « Mon profil » and read this information, without being able to
change it; the page tells them that changes go through the administration.

**Why this priority**: useful and expected, but with no security consequence; the information
already exists elsewhere (administration) for the super administrator.

**Independent Test**: sign in with an account of each role and an account that is a member of each
group; the page displays the right values, none of them editable.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open « Mon profil », **Then** they see their name,
   their login identifier, their job title, their role (Employé, Admin or Super administrateur),
   and their assignment groups (Surveillants, Enseignants) if they belong to any.
2. **Given** an account with no job title set or that is a member of no assignment group, **When**
   they open their profile, **Then** the page says so explicitly (for example « Non renseignée »,
   « Aucun »), with no empty field or error.
3. **Given** the « Mon profil » page, **When** they try to change their name or job title,
   **Then** no change is possible and the page says these are requested from the
   administration.
4. **Given** an account whose role, job title or groups the administration has just changed,
   **When** the user opens or reloads their profile, **Then** they see the
   up-to-date values.

---

### Edge Cases

- **Forced change in progress**: while the change is forced, the profile is not
  reachable (the forced flow takes precedence, as today for any page).
- **Expired session** during input: the current behavior applies (return to
  sign-in), no password is changed.
- **Other open sessions** (other browser, phone): closed by the change, as
  today; the user is told so in the confirmation.
- **New password identical to the current one**: same rule as today (no new
  rule introduced by this feature).
- **Mobile**: the profile block is in the menu drawer; it must lead to the profile in the same
  way, and the page fits in 320 px with no horizontal scrolling.
- **Account disabled while viewing**: current behavior (session closed, return to
  sign-in).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The menu's profile block (desktop and mobile drawer) MUST be a link to the
  « Mon profil » page, announced as such to assistive technologies (explicit accessible name, for
  example « Mon profil, <nom> »).
- **FR-002**: The « Mon profil » page MUST be accessible to any signed-in user, whatever their
  role, and to them alone: it displays only the signed-in account's information.
- **FR-003**: The page MUST display, read-only: name, login identifier, job title,
  role, and assignment groups (Surveillants, Enseignants) the account is a member of.
- **FR-004**: A missing value (job title not set, no group) MUST be displayed with
  an explicit label, never as an empty field.
- **FR-005**: The page MUST state that the name, job title, role and groups are changed
  by the administration, and MUST NOT offer any way to change them.
- **FR-006**: The page MUST offer the « Changer mon mot de passe » action, which opens the existing
  change flow (same rules and same messages as today).
- **FR-007**: When opened from the profile, the change flow MUST allow cancelling and
  returning to the profile without changing anything.
- **FR-008**: After a successful change from the profile, the user MUST return to
  « Mon profil » with a confirmation message, announced to assistive technologies, that
  states that their other sessions have been closed; they stay signed in in the current browser.
- **FR-009**: The **forced** change flow (first sign-in, reset password)
  MUST remain unchanged: mandatory, with no possible cancel, then home page.
- **FR-010**: The password change MUST keep its current guarantees: verification
  of the current password, minimum length, closing of other sessions, logging in the
  audit log.
- **FR-011**: The page and the flow MUST comply with WCAG 2.2 AA: fully usable
  by keyboard, consistent headings and reading order, visible focus, errors tied to fields,
  no violation detected by the project's automated audit tool.
- **FR-012**: The page MUST fit in 320 px width with no horizontal scrolling, and remain readable
  on desktop.
- **FR-013**: The refusal message that points to « Changer mon mot de passe » MUST designate an
  action actually present in the interface, with the same label.

### Key Entities *(include if feature involves data)*

- **User account** (existing): name, login identifier, job title, role, "password
  to change" state. Read, never modified by this feature, except the password through the
  existing flow.
- **Assignment group** (existing): groups with the system keys Surveillants and Enseignants; only
  the signed-in account's membership is displayed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any page of the application, a user reaches the password change
  form in 2 actions at most (open the profile, then « Changer mon mot de
  passe »), by keyboard as well as by mouse, on mobile as well as desktop.
- **SC-002**: 100% of the demo accounts (one per role, plus a member of each group)
  see on their profile information identical to that of the administration.
- **SC-003**: After a successful change from the profile, 100% of the account's other sessions are
  closed and sign-in with the new password succeeds.
- **SC-004**: No accessibility violation detected by the automated audit on the
  « Mon profil » page and on the change flow, at 320 px and on desktop.
- **SC-005**: The flow forced at first sign-in stays covered by its existing tests,
  with no change to their expectations.

## Assumptions

- The information displayed already exists in the account; no new data is created.
  The signed-in account can read its own information, and only that.
- The floor a supervisor is attached to, the categories the user is a recipient or
  admin of, and the detailed permissions per role are **not** displayed in this first
  version (minimal display requested); they remain viewable by the super administrator in
  the administration.
- The existing password change page is reused; only access, cancel and
  return to the profile are added for the voluntary flow.
- The password rules (at least 12 characters) and the closing of other sessions do not
  change.
- Out of scope (confirmed): changing the name or job title by the user, profile
  picture, preferences (notifications, language), personal sign-in history.
