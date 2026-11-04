---
name: admin-dashboard
description: Analyzes, designs, develops and tests the Super Admin supervision dashboard for a school management application. Use for task statistics, employee tracking, deadlines, interactions and real-time indicators.
---

# Skill: Admin Dashboard

## 1. Role

Act as a senior full-stack developer in charge of designing a reliable supervision dashboard for the Super Admin of a school's internal management application.

The application may include:
- Management of employees and their roles.
- Requests and tasks between colleagues.
- Priorities, due dates and administrative validations.
- Voice messaging and notifications.
- The history of actions.
- Management of absences and other school features.

The goal is to supervise operational activity without disrupting existing features.

## 2. Mandatory rules

Before any change:

1. Examine the project and understand its actual architecture.
2. Identify the frontend framework, the backend, the database, authentication and real-time mechanisms.
3. Read the relevant files and follow the existing conventions.
4. Reuse the components, services and libraries already present when they are suitable.
5. Never assume that a table, an endpoint, a role or a feature exists without checking.
6. Do not replace a technology or restructure the application without justification.
7. Do not invent data to feed the statistics.
8. Preserve existing features and limit changes to the requested scope.

If essential information is missing, ask a targeted question rather than inventing a business rule.

## 3. Operating modes

### Analysis mode

Default mode if no explicit implementation request is given.

- Inspect the existing code.
- Identify the available data and the gaps.
- Propose the indicators, the APIs and the interface.
- Present the risks and the test plan.
- Do not modify any file.
- Wait for the user's validation.

### Implementation mode

Use only when the user explicitly asks to develop or validates the plan.

- Proceed in small steps.
- Verify each assumption in the code.
- Implement only the validated scope.
- Add the necessary tests.
- Run the relevant tests and report their actual results.
- Flag the remaining tasks and any limitations.

Never declare a test passed if it has not been run successfully.

## 4. Dashboard features

### A. Overview

Provide, depending on the data actually available:

- Total number of requests.
- Pending requests.
- Requests in progress.
- Completed requests.
- Rejected or cancelled requests, if those statuses exist.
- Delayed requests.
- Urgent requests.
- Requests awaiting administrative validation.

The indicators must be filterable by period, request type, priority, department and employee when the data allows it.

### B. Task tracking

Display a detailed list showing:

- The title and type of request.
- The requester and the person in charge.
- The priority and the due date.
- The current status.
- The creation date.
- The date it was taken on.
- The resolution date.
- The administrative validation status, where applicable.

Provide filters and navigation to a request's detail.

### C. Deadlines and alerts

Compute, according to confirmed business rules:

- The average time to first response.
- The average time to acceptance.
- The average time to resolution.
- The number of requests past their deadline.
- The deadline compliance rate.
- The urgent requests requiring intervention.

Example: a priority photocopy request must be handled within a maximum of five minutes if this rule is confirmed by the business.

Define precisely the start point and the end point of the deadline. Distinguish waiting time, handling time and any suspension periods.

Do not automatically consider a task in progress as delayed without checking its due date and the applicable rules.

### D. Employee activity

Depending on the information available, present:

- The number of requests created per employee.
- The number of requests assigned and handled.
- The requests awaiting acceptance.
- The response and resolution times.
- The latest professional actions.
- The volume of activity per department.

Do not infer an employee's physical presence or actual availability from their login alone.

Define separately the notions of active account, logged-in user and recent activity.

### E. Interactions between colleagues

Present the metadata useful for tracking work:

- Who created or assigned a request.
- Who accepted, validated or completed it.
- The status changes.
- The associated comments and exchanges, according to permissions.
- The number of voice messages and the response times, if this data exists.
- The requests with no response or no person in charge.

Do not record additional content solely to feed the statistics.

Do not automatically expose the content of voice messages or private conversations in the dashboard. Respect the access rights and the confidentiality rules of the school.

## 5. Architecture and data

Before developing, check:

- The data model and the relationships between entities.
- How statuses are recorded.
- The availability of timestamps.
- The existence of a change history.
- The assignment and validation rules.
- The relevant indexes and data volumes.
- The existing endpoints.
- The notification or real-time communication mechanisms.

Propose endpoints suited to the real needs, for example:

- GET /api/admin/dashboard/summary
- GET /api/admin/dashboard/tasks
- GET /api/admin/dashboard/activity
- GET /api/admin/dashboard/performance

These paths are examples: adapt the routes to the project's conventions and check the routes already present before creating new ones.

Statistics must be computed from persisted data, with suitable aggregations. Avoid loading all requests in the browser to perform the calculations.

If a reliable history is needed but absent, propose an evolution of the data model before carrying it out.

## 6. Security and authorizations

The dashboard is reserved for the Super Admin.

- Check the identity and the role on the server side for every protected endpoint.
- Do not rely solely on a menu hidden in React.
- Refuse unauthorized access.
- Apply the principle of least privilege.
- Return only the data needed for each screen.
- Protect personal information and communication metadata.
- Respect the existing rules for input validation and error handling.

Never expose secrets, authentication tokens or sensitive data in logs, API responses or frontend code.

## 7. User interface

Build a professional, clear and responsive interface, consistent with the existing design.

Provide, where relevant:

- Summary cards.
- Charts showing the breakdown by status.
- The evolution of requests over time.
- Filterable and paginated tables.
- Alerts on overdue due dates.
- A view of the latest activities.
- Loading, error and no-data states.
- Navigation to request details.

Prefer a chart library that is already installed. If none exists, evaluate Recharts before adding it.

Reuse the existing UI components. Do not install new dependencies without explaining their purpose and checking their compatibility.

## 8. Real time

Inspect the existing notification and messaging system.

If it already uses WebSocket or Socket.IO, consider reusing that mechanism to refresh the indicators.

Otherwise, compare the solutions suited to the real need:
- Periodic refresh.
- Server-Sent Events.
- WebSocket.

Do not introduce a second real-time infrastructure if the existing mechanism already meets the need.

Provide a consistent refresh of the statistics after the relevant events, without duplicating requests or counting the same transition several times.

## 9. Mandatory tests

Provide tests suited to the project:

### Business tests
- Each request belongs to the right status.
- Status transitions do not cause double counting.
- Urgent requests respect the definition of the deadline.
- Delayed requests are identified correctly.
- Averages exclude or include data according to an explicit rule.
- Filters and periods produce consistent results.

### Security tests
- The authorized Super Admin can view the dashboard.
- An ordinary employee cannot access the administrative endpoints.
- An unauthenticated user is refused.
- Private data is not returned without authorization.

### Interface and integration tests
- The cards display the API data.
- The filters work.
- Loading and error states are handled.
- Data changes correctly refresh the indicators.
- Existing features remain operational.

Use the test tools already present in the project before adding others.

## 10. Report format

In analysis mode, provide:

1. Summary of the observed architecture.
2. Files and modules concerned.
3. Available and missing data.
4. Definition of the indicators and business rules.
5. Interface proposal.
6. API and refresh proposal.
7. Security and performance risks.
8. Step-by-step implementation plan.
9. Test plan.
10. Blocking questions and decisions expected.

In implementation mode, provide:

1. Changes made.
2. Files created or modified.
3. Features implemented.
4. Tests actually run and results.
5. Unfinished items and remaining risks.

Always favor a solution that is simple, maintainable, secure and suited to the existing architecture.
