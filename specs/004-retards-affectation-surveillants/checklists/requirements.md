# Specification Quality Checklist: Retards et absences des enseignants, affectation des surveillants

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- The user explicitly asked that ambiguous points be listed as questions, not resolved by
  assumption. The spec therefore keeps 3 [NEEDS CLARIFICATION] markers (FR-004 / Q1, FR-005 / Q3,
  FR-011 / Q2) and 17 more open questions (Q4–Q20) that several FRs refer to. The three unchecked
  items follow from that choice; they will clear once `/speckit-clarify` has answered them.
- "No implementation details": the "État des lieux" section cites file paths so the plan can find
  the existing code. The requirements themselves stay functional.
- Iteration 2 (2026-10-16): Q1, Q2 and Q3 were answered and recorded under "Clarifications". The
  3 markers are gone and FR-004, FR-005, FR-006, FR-009, FR-011/011a and FR-015 were rewritten.
  "Testable and unambiguous" and "clear acceptance criteria" are still unchecked, because Q4–Q20
  stay open on purpose (statuses, time slots, floors, availability, cancellation, GDPR, stats).
  They are for `/speckit-clarify`.
- Iteration 3 (2026-10-16): the rest of Q1, Q2, Q3 and Q9 is resolved. Added FR-004a–d,
  FR-005a, FR-011b, FR-011c, and FR-015 now says the declaration starts "en cours". Q2 still has
  two sub-questions: the pick-up deadline without broadcast, and the "Non pourvues" guards. Q4–Q8
  and Q10–Q20 are open.
- Iteration 4 (2026-10-16): added the Q2 complements: FR-011d (pick-up deadline), FR-011e (alert
  and escalation), and FR-011c now covers the "Non pourvues" guards. Q2 now keeps only precise
  parameters open: reminder time, escalation delay, the deadline for distant time slots on the
  same day, and where the "non pourvue" status fits.
- Iteration 5 (2026-10-16): Q2 settings recorded. FR-008 now has six statuses, and FR-008a,
  FR-011d (60-minute threshold), FR-011e (5-minute escalation, what counts as a reply) and
  FR-011f (7:00 reminder) were added. Q2 still has one open point: the status of an admin
  "refus". Q4 is narrowed to how the current guard states map onto the six statuses.
- Iteration 6 (2026-10-16): Q2 (refusal) and Q4 are resolved. FR-008 now lists seven statuses,
  FR-008a (final statuses, reasons) was rewritten, and FR-008b (refusal by admin only), FR-008c
  (sub-states shown as badges) and FR-008d (migration with a pre-check) were added. FR-008b is my
  reading of "refus par l'admin"; the user should confirm it.
- Iteration 7 (2026-10-16): refusal removed, back to six statuses. FR-008 and FR-008a were
  updated, FR-008b was rewritten, and FR-008e (cancel after assignment) and FR-008f (assignment
  is an order) were added. FR-011e: only assignment or cancellation stops the escalation.
  FR-008b has 1 [NEEDS CLARIFICATION] marker: cancellation before assignment (option 1 or 2) is
  the user's call.
- Iteration 8 (2026-10-16): option 1 chosen. FR-008b is resolved (assign or cancel). Added
  FR-008g (teacher withdraws or edits while "en attente"), FR-008h (only the admin can cancel an
  empty-class report), FR-008i (cancellations counted separately). FR-011e: escalation stops on
  assignment or cancellation/withdrawal. No markers remain. Q12 keeps one point open:
  reassignment ("annule ou réassigne" contradicts "uniquement annuler").
- Iteration 9 (2026-10-16): reassignment settled. FR-008e now allows cancel or reassign while
  "assignée". Added FR-008j (reassign while "en cours", original supervisor released after relief
  confirms presence) and FR-008k (reassignment traced). FR-008h now covers any "en cours". Q12 is
  closed. Q9 is narrowed to whether the teacher must be identified.
- Iteration 10 (2026-10-16): Q9 answered, FR-015a–d added. A blocking point was raised and is
  not decided: no timetable exists in the app, so pre-filling the teacher depends on a scope
  decision (create a timetable or not). Q5/Q6 depend on it.
- Iteration 11 (2026-10-16): timetable deferred. FR-015a has no pre-fill but a field that can
  take one later. Q5 (free time range) and Q6 (all classes) are resolved; FR-012, the entity
  "Créneau" and the out-of-scope list were updated. FR-015d is partial: the user's answer was cut
  off at "Si une demande…". The case of a request already assigned stays open in Q13.
- Iteration 12 (2026-10-16): Q13 and Q5 resolved. Added FR-015e/f/g (duplicates), FR-012
  (one class, one time range) and FR-012a (later grouping). Absence management added to "Hors
  périmètre". Two Q13 sub-points remain: is a backup supervisor "busy", and how are two
  affectations counted when the admin refuses to merge them?
- Iteration 13 (2026-10-16): last Q13 answers recorded. Added FR-015h ("doublon possible",
  provisional and final counting) and FR-015i (backup supervisor busy, 10-minute reminder); FR-015g
  now traces every decision. Two minor Q13 points remain: what happens with no decision after the
  last presentation, and is the reminder repeated?
- Iteration 14 (2026-10-16): Q13 fully closed. FR-015h now covers "non tranché" and after-the-fact
  decisions. FR-015i now repeats the reminder (10 min, max 3), then escalates to the super
  administrator.
- Iteration 15 (2026-10-16): Q7, Q8, Q10, Q11 and Q14–Q20 answered. Checked in the code: there
  is no email, SMS, push or PWA, only one responsive web app. FR-006, FR-010, FR-012, FR-016/016a,
  FR-021–FR-023b, FR-024/024a and FR-025 were updated. Stale references in the scenarios and edge
  cases were cleaned up. Open sub-points: Q7 (who manages floors, floors outside 1–2), Q8
  (existing declared availability), Q10 (reminder delays), Q16 (purge vs. non-modifiable audit:
  conflict with constitution V), Q18 (all admins or only coverage managers), and the new Q21
  (busy supervisor who finds an empty class).
- Iteration 16 (2026-10-16): Q7, Q8, Q10, Q16, Q18 and Q21 are resolved. Updates: FR-006/006a
  (floors), FR-010 (declared availability), FR-016a (10 + 10 min), FR-023a (anonymization, audit
  log excluded), FR-023b (all admins), FR-023c (supervisor sees no detailed reason), FR-015j
  (busy supervisor) and FR-024a. One point is still open: what the "raison courte" is (Q16). It
  blocks the two unchecked items.
- Iteration 17 (2026-10-16): Q16 resolved: the "raison courte" is the report type. Added FR-007a
  (type retard / absence / classe vide); FR-023c updated (supervisor sees class, floor, time slot,
  type). All questions Q1–Q21 are resolved and every checklist item passes. The spec is ready for
  `/speckit-plan`.
- Validation iteration 1: SC-002 assumed a phone, which is an assumption about Q20. It was
  reworded.
