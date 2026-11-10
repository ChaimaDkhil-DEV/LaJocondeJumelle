# Feature Specification: Communication enseignant / parents (Teacher-to-parent communication)

**Feature Branch**: none (work on `master`, uncommitted, as requested on 2026-11-09)

**Created**: 2026-11-09

**Status**: In progress

**Input**: a teacher sends the parents of a student a written remark and an original voice message. Every
communication must be approved by an authorised administrator before the parent can see it. External
notifications (email, WhatsApp Business Platform) are automated by n8n; NestJS stays the only authority on
permissions, validation and statuses.

## Clarifications (2026-11-09)

- Q: How do parents reach « Messages de l'école »? → A: **parent accounts**: new role `PARENT`, account created
  by the administration (username, initial password to change at first login), like employees. A parent only
  sees « Messages de l'école » and their profile.
- Q: Who creates the legal representatives? → A: **the administration**: a representative record (name,
  relationship, phone, email, optional parent account) linked to one or more students; several
  representatives per student.
- Q: Which students may a teacher choose? → A: **assigned classes**: the administration assigns classes to
  each teacher (member of the Enseignants group); a teacher only sees the students of these classes.
- Q: Who validates? → A: **new permission** `PARENT_COMMUNICATION_VALIDATE`: the super administrator always has
  it and can grant it to the ADMIN role in the existing role permissions settings.
  - **Amended 2026-11-10:** the general supervisor (« surveillante générale », role ADMIN) validates the
    messages: the ADMIN role now has the permission **by default** (default permissions and data migration
    `0022_admin_validates_parent_communications`). The super administrator can withdraw it, or grant it again,
    in « Réglages › Permissions par rôle ». It can be set for the ADMIN role only, never for EMPLOYEE or PARENT.

## User Scenarios

### US1 — The teacher prepares and submits a communication (P1)

The teacher opens « Communication avec les parents », chooses a student of an assigned class, then a
representative linked to that student, writes a remark, records a voice message (listen, record again), saves
a draft, and submits it. Remark **and** voice message are required to submit. Once submitted, the
communication cannot be edited while it waits for validation. The teacher follows its status and reads the
reason of a return or a rejection.

### US2 — The administration validates (P1)

A validator opens « Communications à valider », filters by teacher, student, class and date, reads the
remark, listens to the voice message, sees the recipient, then approves and publishes, returns for correction
(reason required) or rejects (reason required). The approval applies to exactly the version examined: if the
submitted version changed, the approval is refused. A teacher can never approve their own communication; one
validator is enough; an approval cannot be executed twice.

### US3 — The parent reads « Messages de l'école » (P1)

The parent sees the approved communications about their linked children only: remark, voice message, teacher,
date, read state. Nothing in draft, pending, returned, rejected or cancelled state is ever visible.

### US4 — Return for correction and history (P2)

After a return, the teacher is notified, sees the reason, edits the text and/or replaces the audio, and
submits a new version, which needs a new approval. Every version and decision is kept.

### US5 — External notifications through n8n (P2)

After approval, NestJS writes an outbox event `PARENT_COMMUNICATION_APPROVED` in the same transaction as the
publication. A dispatcher sends it reliably to n8n (signed webhook, retries, replay protection). n8n asks the
backend for the minimal data (recipient contact, enabled channels, link to the app — never the remark text or
the audio), sends email and/or WhatsApp Business Platform messages, then reports each delivery result. Without
n8n or without a configured provider, the communication stays available in the parent space; an n8n outage
never blocks publication or reading.

## Requirements

- **FR-001** Statuses: `DRAFT`, `PENDING_ADMIN_VALIDATION`, `RETURNED_FOR_CORRECTION`, `APPROVED`, `REJECTED`,
  `CANCELLED`. Transitions: DRAFT→PENDING (submit), DRAFT→CANCELLED, PENDING→APPROVED|RETURNED|REJECTED,
  RETURNED→PENDING (submit a new version), RETURNED→CANCELLED. APPROVED, REJECTED and CANCELLED are final.
- **FR-002** Only the author (teacher of an assigned class of the student) edits, submits or cancels; only in
  DRAFT or RETURNED. Submit requires a non-empty remark and a voice file.
- **FR-003** Each submission freezes a numbered revision (text + voice file). Edits after a return create a
  new revision; an approved revision is never modified.
- **FR-004** Decisions require `PARENT_COMMUNICATION_VALIDATE`, an author different from the validator, the
  status PENDING and the revision number examined (`revision`), plus the version (optimistic lock). Return and
  reject require a reason (1 to 1000 characters).
- **FR-005** Parents see only APPROVED communications addressed to a representative linked to their account
  and to one of their linked active students; reading marks the communication read (first reading kept).
- **FR-006** Voice files: existing voice pipeline (real type, size and duration limits from the settings,
  private storage, unpredictable names, authenticated download). A communication voice file is readable by
  its author, validators, and the recipient parent once approved. Files of communications are never removed by
  the orphan cleanup; abandoned drafts follow the usual 24 h rule only while unattached.
- **FR-007** Internal notifications (existing bell): new communication to validate (validators), returned,
  approved, rejected (teacher), new message (parent). Other notifications keep their behaviour; the new types
  are never pushed (bell only).
- **FR-008** Every sensitive action is audited (create, submit, approve, return, reject, cancel, parent read,
  denied access, representative and assignment changes, n8n callbacks).
- **FR-009** Outbox: event written in the approval transaction; dispatcher with bounded retries, exponential
  delay, timeout, HMAC-signed body, unique event id; replayed or unknown events are ignored; pending events
  resume after a restart.
- **FR-010** n8n endpoints are authenticated by a shared secret (constant-time comparison), return only the
  minimal data, and accept idempotent delivery reports per (communication, channel) with statuses `PENDING`,
  `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `RETRYING`. The frontend never calls n8n.
- **FR-011** Channels enabled by configuration (`PARENT_COMM_CHANNELS`: `EMAIL`, `WHATSAPP`); with no n8n URL
  the outbox events are kept and nothing is sent.
- **FR-012** Administration manages representatives (create, edit, deactivate, link students, create the
  parent account) and teacher class assignments; parent accounts never appear among employees, recipients,
  groups or statistics.
- **FR-013** Accessibility WCAG 2.2 AA, 320 px wide, loading, empty and error states, confirmation of
  sensitive actions.

## Success criteria

- **SC-001** 0 communication visible to a parent, or sent outside, before an explicit approval.
- **SC-002** An approval executed twice (double click, replay) produces one approval and one outbox event.
- **SC-003** n8n stopped: approval and parent reading work as usual; the outbox event is sent when n8n is back.
