# Verification of feature 014 — push notifications and user preferences

Branch `014-notifications-push-preferences`. Specification, plan and tasks:
[specs/014-notifications-push-preferences/](../../specs/014-notifications-push-preferences/).

## Initial state (T001)

| Step | Result |
|---|---|
| CI on `4dbc4b8` (master, "Contrôles qualité", all steps) | green |
| Local lint, `npm audit --audit-level=high`, backend and frontend type checks | green; audit: 30 low/moderate, no high or critical |
| Local backend unit tests | 842 / 842 |
| Local integration and frontend tests | interrupted on request; the green CI on `4dbc4b8` serves as the baseline |

## Final automated checks (T068, T071, T072)

| Step | Result |
|---|---|
| `npm run lint` | green |
| Type checks (backend, frontend) | green |
| Backend unit tests | 1055 / 1055 (842 + 213 new), including `architecture-layers.spec.ts` |
| Backend integration tests | 961 passed, 1 skipped (`assist-whisper-live`, needs a live Whisper server) |
| Frontend tests (Vitest) | 680 / 680 (571 + 109) |
| `npm audit --audit-level=high` | unchanged: 30 low/moderate, no high or critical (`web-push` 3.6.7 adds none) |
| End to end, `e2e/notifications-push.spec.ts` (chromium, mobile-320) | 3 passed, 3 skipped by design |
| End to end, full suite (7 profiles) | see "Full end-to-end run" below |

## Requirements and their checks (T074)

| Requirement | Checked by |
|---|---|
| FR-001 no permission prompt before the click | `frontend/tests/push/notifications-section.test.tsx` |
| FR-002 iPhone steps, installable app | `push-support.test.ts`, `notifications-section.test.tsx`, `manifest.test.ts` |
| FR-003 device state, device list, shared-device note | `notifications-section.test.tsx`, `devices-list.test.tsx` |
| FR-004 mapping, recipients unchanged, D4 | `backend/test/unit/push-category.spec.ts` (every enum value), `push-dispatch.spec.ts` (a–d) |
| FR-005 after commit, never blocking | `notification-publisher.spec.ts`, `push-resilience.spec.ts` |
| FR-006 30 min validity | `push-sender.spec.ts` |
| FR-007 minimal content (SC-006) | `push-payload.spec.ts` (16 types × 2 kinds), `frontend/tests/push/sw.test.ts` |
| FR-008 read only after a successful opening, login path included | `frontend/tests/push/read-after-open.test.tsx` |
| FR-009 categories, account sound, last write wins | `notification-preferences.spec.ts`, `notifications-categories.test.tsx`, `urgent-sound-account.test.tsx`, `push-dispatch.spec.ts` (US3) |
| FR-010 sending hours, super administrator only, audited | `push-window.spec.ts`, `push-window-settings.spec.ts`, `frontend/tests/admin/push-window-settings.test.tsx`, `push-dispatch.spec.ts` (US4) |
| FR-011 stored data, deletion cases, 90 days | `migration-0019.spec.ts`, `push-subscriptions.spec.ts`, `push-lifecycle.spec.ts`, `push-subscriptions-cleanup-job.spec.ts`; register record in [docs/notifications-push.md](../notifications-push.md) |
| FR-012 / NFR-006 logs | `push-dispatch.spec.ts` (h): type, code and fingerprint only; no address, content, subscription keys or private key |
| FR-013 off without keys | `config.spec.ts`, `push-subscriptions.spec.ts` (disabled), `notifications-section.test.tsx`, e2e |
| FR-014 no real push service, accessibility | simulated sender in every test; axe in `e2e/notifications-push.spec.ts` |
| FR-015 several devices | `push-dispatch.spec.ts` (a) |
| FR-016 no duplicates | topic (`push-sender.spec.ts`, `push-dispatch.spec.ts`), tag (`sw.test.ts`), single subscription per address (`push-subscriptions.spec.ts`) |
| FR-017 bounded retries | `push-retry.spec.ts`, `push-dispatch.spec.ts` (pending attempt) |
| FR-018 personal and school settings kept apart | hours enforced by the server; no route to change another user's preferences; `PUSH_DISABLED` |
| FR-019 own devices only, denial logged | `push-subscriptions.spec.ts` (401), `push-lifecycle.spec.ts` (404 + `ACCESS_DENIED`) |
| FR-020 deletion effective before any later delivery | `push-lifecycle.spec.ts`, `push-dispatch.spec.ts` (j–l) |
| NFR-001 recognised push services only (SSRF) | `push-endpoint.spec.ts`, `push-subscriptions.spec.ts` |
| NFR-002 private key | `config.spec.ts`, `push-subscriptions.spec.ts` (`GET /api/push/config`), `push-dispatch.spec.ts` (h) |
| NFR-003 service worker without fetch handler or cache, updates itself | `sw.test.ts`; Caddy headers and CSP: pre-production, pending (T073) |
| NFR-004 / SC-005 app unchanged without push | `push-resilience.spec.ts` (failing and silent push service: same notifications as without push) |
| NFR-005 320 px portrait and landscape | `e2e/notifications-push.spec.ts` (mobile-320) |
| SC-002 | `push-category.spec.ts`, `push-dispatch.spec.ts` |
| SC-003 | `push-lifecycle.spec.ts` |
| SC-004 one click to turn a category off | `notifications-categories.test.tsx` |
| SC-001 display within 10 s in 95 % of cases | pre-production measurement, pending (T073) |

## Existing expectations modified (exceptions recorded)

| File | Expectation | Reason |
|---|---|---|
| `frontend/tests/auth/profile.test.tsx`, `change-password.test.tsx` | any `role="status"` on "Mon profil" | the new section has its own status region: the tests now target the password confirmation itself |
| `frontend/tests/notifications/urgent-alert.test.tsx` | urgent sound stored in the browser | the sound is now an account preference (NC-6): the test serves the preferences |
| `backend/test/integration/admin-categories.spec.ts` | exact `GET /api/settings/client` body | the route now also returns the sending hours |
| `frontend/tests/admin/admin-pages.test.tsx` | `SETTINGS` fixture | the settings response now includes the sending hours |

## Defect found and fixed during implementation

`push-resilience.spec.ts` showed that a rejected promise from the sender reached Node as an unhandled
rejection, which can stop the process. The dispatcher now treats a sender exception as a network error (bounded
retry) and catches any error of a delivery.

## Defect found in the pre-merge review and fixed (09/11/2026)

The diff review of pull request #90 found that `usePushDevice.activate()` subscribed right after `register()`. On a
first activation the service worker is still installing, and Chromium refuses to subscribe without an active one
("Subscription failed - no active Service Worker"): the first click would have shown « Activation impossible ». The
simulated browser in `frontend/tests/push/push-env.ts` always returned an active worker, so no test could see it. It
now models a worker that becomes active later (`activatesLater`) and refuses `subscribe()` without one; the test
« première activation, service worker encore en installation » in `notifications-section.test.tsx` failed first, then
passed once `activate()` waits for `navigator.serviceWorker.ready`. Not yet checked on a real device (T073).

## Pending: manual checks in pre-production (T073)

Not done: they need real devices and the pre-production server behind Caddy. Protocol in the
[quickstart](../../specs/014-notifications-push-preferences/quickstart.md):

- Android (Chrome) and iPhone (Home Screen app) scenarios 1 to 7;
- `curl -I` on `/sw.js` (`Cache-Control: no-cache`, JavaScript type) and `/manifest.json` (`application/json`);
- browser console without content security policy violations;
- `SCHOOL_TIMEZONE=Africa/Tunis` on the server;
- SC-001: 20 sends per platform, at least 95 % displayed within 10 s, conditions recorded below.

| Check | Result |
|---|---|
| Android scenarios | to do |
| iPhone scenarios | to do |
| Caddy headers and CSP | to do |
| SC-001 Android | to do |
| SC-001 iPhone | to do |

## Remaining low-severity gaps

- Touch interaction is not exercised by a dedicated automated test (mobile profiles run the e2e scenarios).
- The limit of 10 concurrent sends is not covered by a dedicated test.
- The refusal of `ADMIN` on the sending hours (403) is tested, but not the audit entry of that refusal
  (existing behaviour of the settings route).

## Full end-to-end run

To be filled in when the run completes.
