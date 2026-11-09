# Feature Specification: Déclaration d'une classe vide par QR code, caméra dans l'application (Empty-class declaration by QR code, camera inside the app)

**Feature Branch**: `013-declaration-classe-vide-qr`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Déclaration d'une classe vide par QR code, caméra dans l'application. La page « Déclarer une classe vide » propose deux choix : en tête, un grand bouton « Scanner le QR code de la classe » qui ouvre la caméra directement dans l'application ; dès que le QR collé sur la porte est lu, la déclaration est envoyée automatiquement, sans autre saisie ni confirmation, avec la classe tirée du QR et le QR comme preuve de présence ; en dessous, le formulaire actuel, inchangé. Sans caméra : coller le lien ou le code du QR, ou utiliser le formulaire. Le chemin par l'appareil photo du téléphone reste tel quel, avec son clic de confirmation. Règles serveur inchangées. Seuls les membres du groupe Surveillants peuvent déclarer."

## Context

Today a supervisor who finds a class without a teacher has two ways to declare it empty:

- the « Déclarer une classe vide » form: choose the class, optionally the absent teacher, then submit;
- scanning the class QR code with the phone's own camera app: it opens a link in the browser, on a page
  where the supervisor clicks « Déclarer cette classe vide ».

Both force the supervisor to leave the task (switching apps, typing, scrolling a class list) while pupils
are alone. The application already has a QR reader that works inside the page (used by teachers to clock
in), which supervisors do not get.

Decisions of the user (2026-11-08, counting as clarifications):

- the « Déclarer une classe vide » page offers **two choices**: scan the QR code (first, prominent) or fill in
  the form (below, unchanged);
- scanning opens the camera **inside the application**, never another application;
- once the QR is read, the declaration is **sent automatically**, with no other input and no confirmation;
- the path through the phone's own camera app **stays as it is**, with its confirmation click, because the
  same QR code is also used to confirm presence on an assignment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Declare by scanning, without leaving the app (Priority: P1)

During her round, a supervisor finds CE1 Vert empty. In « Surveillance » she taps « Déclarer une classe
vide », then « Scanner le QR code de la classe ». The camera opens in the page; she points it at the QR code
on the door. As soon as it is read, the declaration is sent: the screen shows « Classe CE1 Vert déclarée
vide… », the assignment is in her name and in progress, and the admin is notified.

**Why this priority**: it is the whole point of the change: one gesture at the door, no typing, no app
switch.

**Independent Test**: as a supervisor, on a device with a camera, scan a class QR code from the new button;
check that the declaration exists for that class, with a QR presence proof, and that the result shows the
class name.

**Acceptance Scenarios**:

1. **Given** a supervisor on « Déclarer une classe vide », **When** the page opens, **Then** the first
   action offered is « Scanner le QR code de la classe », above the form.
2. **Given** she taps « Scanner le QR code de la classe », **When** the device has a camera and she allows
   it, **Then** the camera view opens inside the application, without opening another application.
3. **Given** the camera view is open, **When** a valid class QR code is read, **Then** the declaration is
   sent at once, with no other input or confirmation, for the class encoded in the QR code, and the QR code
   counts as her presence proof.
4. **Given** the declaration succeeded, **When** the result is shown, **Then** it names the class clearly and
   gives the usual outcome message (new assignment, support, attached request, already assigned, possible
   duplicate), as with the form.
5. **Given** the result screen, **When** she wants to declare another class, **Then** she can start a new scan
   from there.

---

### User Story 2 - Without a camera, or by preference: the form and a manual entry (Priority: P1)

A supervisor whose phone refuses camera access, or who uses a screen reader, can still declare: she pastes
the link or code of the QR code in the scanning window, or she uses the form below the scan button, which
works as today.

**Why this priority**: the scan must never become the only way; accessibility and devices without a camera
must keep a complete path.

**Independent Test**: refuse camera access; declare by pasting the QR link; then declare with the form;
check both produce the same declarations as before.

**Acceptance Scenarios**:

1. **Given** camera access is refused or unavailable, **When** the scanning window opens, **Then** it says so
   clearly and offers to paste the link or code of the QR code.
2. **Given** a pasted valid QR link or code, **When** the supervisor validates it, **Then** the declaration is
   sent as for a scan.
3. **Given** the form below the scan button, **When** the supervisor uses it (class, optional teacher),
   **Then** it behaves exactly as today.
4. **Given** the scanning window, **When** the supervisor closes it, **Then** she is back on the page with the
   form, and nothing was sent.

---

### User Story 3 - Wrong or unusable QR codes are refused clearly (Priority: P2)

A supervisor scans an old QR code (revoked), a QR code from another school document, or a QR code of an
inactive class. Nothing is declared and she is told why, with what to do next.

**Why this priority**: an automatic send needs clear refusals; the cases are rare but must not leave her
unsure whether the class is covered.

**Independent Test**: scan a revoked class QR code, a non-class QR code and an inactive class QR code; check
that no declaration is created and that each message says what happened.

**Acceptance Scenarios**:

1. **Given** a QR code that is not a class QR code, **When** it is read, **Then** nothing is sent and the
   scanning window says it is not a class QR code, and keeps scanning.
2. **Given** a revoked or forged class QR code, **When** it is read, **Then** the server refuses it, nothing is
   declared, and the message asks to use the QR code on the door or the form.
3. **Given** a QR code of an inactive class, **When** it is read, **Then** nothing is declared and the message
   says the class is inactive.
4. **Given** the same QR code read twice in a row (camera still pointed at the door), **When** the second read
   happens, **Then** no second declaration is created.

---

### User Story 4 - The phone-camera path stays as it is (Priority: P2)

A supervisor who scans the door QR code with the phone's own camera app still lands on the class page, where
« Déclarer cette classe vide » requires a click (and « Préciser l'enseignant » leads to the form), as today.

**Why this priority**: the same QR code is used to confirm presence on an assignment; opening the link must
not declare anything by itself.

**Independent Test**: open a class QR link in the browser as a supervisor; check the page and its
confirmation button are unchanged and nothing is declared before the click.

**Acceptance Scenarios**:

1. **Given** a supervisor opening a class QR link outside the scan button, **When** no assignment is in
   progress for the class, **Then** the page shows « Déclarer cette classe vide » and nothing is declared
   before the click.
2. **Given** an assignment in progress for the class, **When** the assigned supervisor opens the link,
   **Then** presence confirmation works as today.

### Edge Cases

- The supervisor is not in the Surveillants group (teacher, admin only): no scan button for declaration, and
  any attempt is refused by the server, as today.
- The camera view stays open with no QR code in sight: nothing happens until she closes it or pastes a code.
- Network lost right after the read: the usual error is shown and she can retry; a retry of the same
  declaration does not create a duplicate.
- Several cameras (front and back): the back camera is used when available.
- The supervisor already has an assignment in progress: the declaration still goes through and the admin is
  alerted of a double assignment, as today.
- No teacher is indicated by a scan: if a teacher's request already exists for the class, the server proposes
  a duplicate to the admin rather than attaching it (current rule).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The « Déclarer une classe vide » page MUST offer, first and prominently, « Scanner le QR code de
  la classe », and below it the current form, unchanged.
- **FR-002**: « Scanner le QR code de la classe » MUST open the camera inside the application, preferring the
  back camera, without opening another application.
- **FR-003**: When a class QR code is read (or pasted), the application MUST send the empty-class declaration
  at once, with no other input and no confirmation, for the class encoded in the QR code, with the QR code as
  presence proof and no teacher indicated.
- **FR-004**: The result MUST show the class name prominently and the usual outcome message, and offer to
  declare another class.
- **FR-005**: Without camera access (refused, absent, unsupported), the scanning window MUST say so and offer
  to paste the link or code of the QR code; the form MUST remain available on the page.
- **FR-006**: A text or QR code that is not a class QR code MUST be ignored without sending anything, with a
  clear message, and scanning MUST continue.
- **FR-007**: A class QR code refused by the server (revoked, forged, wrong version, inactive class) MUST
  create no declaration and MUST show a message saying why and what to do.
- **FR-008**: Reading the same QR code again during the same scanning session MUST NOT create a second
  declaration; a retry after a network error MUST NOT create a duplicate.
- **FR-009**: Opening a class QR link outside the scan button (phone camera app) MUST behave as today: no
  declaration before an explicit click.
- **FR-010**: Only members of the Surveillants group MUST be able to declare; server rules (outcomes, QR
  verification, rights, notifications, history) MUST NOT change.
- **FR-011**: The scanning window and the page MUST meet the project's accessibility level (WCAG 2.2 AA,
  keyboard use, 320 px wide), with a text alternative to the camera.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A supervisor standing at the door declares an empty class in under 10 seconds from the
  « Déclarer une classe vide » page, with 2 taps and no typing.
- **SC-002**: 0 declaration is created by opening a class QR link outside the scan button without the
  confirmation click.
- **SC-003**: 100 % of refused QR codes (not a class, revoked, inactive class) produce no declaration and a
  message naming the reason.
- **SC-004**: Reading the same QR code several times in one scanning session creates exactly 1 declaration.
- **SC-005**: A supervisor without a camera can still declare, by pasting the QR link or with the form, with
  the same outcomes as today.

## Assumptions

- The application is served over HTTPS (production, online demo) or on the local machine, which browsers
  require to open the camera from a page.
- The in-app QR reader already used by teachers to clock in is reused; its manual entry (paste the link or
  code) covers devices without a camera.
- A scan declares the class « without teacher indicated »; a supervisor who knows the absent teacher and wants
  the request attached uses the form.
- No change to the data model, the server rules or the notifications.
- The « Déclarer une classe vide » button stays where it is today, in the « Surveillance » page header for
  supervisors.

## Amendment (2026-11-09): reading the QR code from the image, more reliably

**Why**: during the online demo, supervisors were asked to paste the link or code although they wanted the
scan to read the QR code itself. The camera could not open (address without https, access refused, no camera,
camera already in use) and the window gave the same message for every cause; when the camera did open, the
paste field shown below it looked mandatory. The scanner is shared with the teachers' clock-in, which gets the
same changes. Server rules are unchanged.

- **FR-002a**: The camera MUST be requested at a higher definition (1280 × 720 ideal, back camera), and the QR
  code MUST be read by the browser's own reader when it reads QR codes, otherwise by jsQR, which also tries
  QR codes with inverted colours.
- **FR-005 (amended)**: Without camera access, the scanning window MUST name the cause and the corrective
  action: address without https, browser without camera access, access refused, no camera found, camera used
  by another application, other error. The photo and the paste field MUST then be offered at once.
- **FR-012**: The scanning window MUST offer « Prendre une photo du QR code »: it opens the phone's camera
  (back camera) and reads the QR code in the photo, even when the camera cannot open inside the page. A class
  QR code in the photo is used like a scanned one; a photo without a QR code, with another QR code, or that
  cannot be read MUST send nothing and say what to do.
- **FR-013**: While the camera is open, the paste field MUST be folded behind « Saisir le lien ou le code du
  QR code » (a button that states whether it is open); without camera access it MUST be shown at once.

Tests: `frontend/tests/attendance/qr-scanner.test.tsx` and `frontend/tests/attendance/qr-reader.test.ts`.
The end-to-end scenarios (`e2e/empty-class-qr.spec.ts`, `e2e/attendance-qr.spec.ts`) unfold the paste field
when the simulated camera opens (`e2e/support/qr-scanner.ts`).
