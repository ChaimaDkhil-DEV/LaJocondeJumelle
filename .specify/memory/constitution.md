# LaJocondeJumelle Constitution

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)

- Any new or changed behavior MUST first be described by a failing automated test, before
  the implementation code is written (Red → Green → Refactor cycle).
- Every user story MUST have acceptance tests traceable to its acceptance criteria
  in the specification.
- Business rules (statuses, transitions, access rights) MUST be covered by unit
  tests; critical user journeys MUST be covered by integration or end-to-end tests.
- No change may be merged if the test suite fails.

**Rationale**: tests written first fix the expected behavior and protect
the administrative rules against silent regressions.

### II. Simplicity / YAGNI

- Every feature MUST be implemented with the simplest solution that satisfies
  the current requirements of the specification.
- No abstraction, dependency, layer or configuration option MUST be added for
  a hypothetical future need.
- Any additional complexity (new service, new major dependency, new architectural
  pattern) MUST be justified in writing in the "Complexity Tracking" section
  of the plan, with the simpler alternative that was rejected and the reason for rejecting it.

**Rationale**: simple code is easier to test, to secure and to evolve.

### III. Accessibility and UX quality

- Every user interface MUST comply with WCAG 2.2 level AA: full keyboard
  navigation, sufficient contrast, explicit labels for form fields, visible focus
  and correct HTML semantics.
- The interface MUST be responsive and usable from 320 px wide up to desktop screens,
  without horizontal scrolling.
- Components, labels, error messages and states (loading, empty, error, success)
  MUST be consistent throughout the application.
- Error messages MUST clearly state the problem and the possible corrective action.
- Automated accessibility checks MUST be part of the test suite of the
  screens delivered.

**Rationale**: an administrative application must be usable by all staff
and users, including those with disabilities.

### IV. Security and data protection

- All inputs (forms, URL parameters, API, uploaded files) MUST be
  validated and sanitized on the server side; client-side validation is never enough.
- No secret (password, API key, token) MUST appear in the source code or in the
  repository history; secrets MUST come from the environment configuration or
  from a secrets manager.
- Only the personal data strictly necessary for a feature MUST be
  collected (minimization, in line with the GDPR); its purpose and retention period
  MUST be documented in the relevant specification.
- Exchanges MUST be encrypted in transit (HTTPS), and passwords MUST be
  stored with a suitable hashing algorithm (e.g. Argon2 or bcrypt).
- Dependencies with known vulnerabilities of high or critical severity MUST
  NOT be shipped to production.

**Rationale**: the application handles administrative requests and internal
communications whose leak or alteration would have serious consequences.

### V. Integrity of administrative workflows and communications

- Every administrative request MUST have an explicit status, taken from a finite and
  documented set, and can change status only through authorized, defined transitions.
- Every creation, modification or status change of a request MUST be recorded in an
  audit log that users cannot modify (author, date and time, action, values
  before and after).
- Access to requests and actions MUST be controlled by role (RBAC); authorizations
  MUST be checked on the server side for every request, following the principle of least
  privilege.
- Internal communications MUST be organized (by thread, request or channel) and
  viewable by authorized users, and MUST be protected against any unauthorized access,
  modification or deletion.
- Every access denial MUST be logged and MUST NOT reveal the existence of resources
  the user has no right to.

**Rationale**: trust in administrative processing rests on clear
statuses, traceability of actions and confidentiality of exchanges.

## Technical and security constraints

- The technical stack (frameworks, database, hosting) is chosen in the implementation
  plan of each feature, in line with principles II and IV; any deviation
  from the existing stack MUST be justified.
- Authentication MUST be mandatory for any non-public feature, and
  sessions MUST expire after a defined period of inactivity.
- Application and audit logs MUST NOT contain secrets or sensitive personal data
  in clear text.
- The data models for requests, roles and communications MUST be documented
  (`data-model.md`) before implementation.

## Development workflow and quality checks

- Every feature follows the Spec Kit cycle: specification → clarification → plan →
  tasks → implementation.
- The plan MUST include a "Constitution Check" verifying compliance with the five principles
  before the design phase, and again after it.
- Every change MUST pass a code review that checks: tests written first and
  green, absence of unjustified complexity, accessibility, security (validation, secrets,
  authorizations), traceability of administrative actions.
- A feature is considered finished only if its acceptance criteria are
  covered by passing tests and the accessibility and dependency checks
  are green.

## Governance

- This constitution prevails over any other practice or convention of the project. In case of
  conflict, the constitution applies.
- Any change to the constitution MUST be proposed in writing, with the justification,
  the impact on existing specifications and plans and, if necessary, a migration plan.
- Semantic versioning of the constitution:
  - MAJOR: removal or incompatible redefinition of a principle or of a
    governance rule;
  - MINOR: addition of a principle or a section, or substantial expansion of the rules;
  - PATCH: clarifications, rewording, corrections with no effect on substance.
- Compliance is verified at every plan (Constitution Check) and at every code review;
  any exemption MUST be documented and justified in the relevant plan.
- A review of the constitution is recommended at every major version of the application.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
