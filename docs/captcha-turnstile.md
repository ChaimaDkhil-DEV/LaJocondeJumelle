# Sign-in CAPTCHA (Cloudflare Turnstile)

Turnstile protects the sign-in form against bots, automated submissions and password guessing. Most people see
nothing; Cloudflare shows a checkbox only when it has a doubt.

**Off by default.** Without keys nothing is loaded from Cloudflare and sign-in works as before.

## What is protected

Only `POST /api/auth/login`. It is the only public endpoint that processes data: accounts are created by the
administration, and there is no public registration, password reset or contact form. Nothing is asked after
sign-in. The CAPTCHA adds to the existing protections and replaces none of them: password, session, permissions,
origin check (CSRF), 5 attempts per minute, 10 failures per account and 100 per IP address in 15 minutes.

| Step | Where |
|---|---|
| The page asks for the public key (`GET /api/auth/captcha`), loads the Cloudflare script and gets a token | [useCaptcha.tsx](../frontend/src/features/auth/useCaptcha.tsx) |
| The token is sent with the credentials (`captchaToken`) | [useCurrentUser.ts](../frontend/src/features/auth/useCurrentUser.ts) |
| Existing rate limit, then token check, then validation and password | [captcha.guard.ts](../backend/src/auth/captcha.guard.ts) |
| Call to Siteverify: the only place that decides | [turnstile.service.ts](../backend/src/auth/turnstile.service.ts) |

A token is accepted only if Cloudflare answers `success: true`, for a host name of `APP_ORIGIN`, for the action
`login`, and if it was never presented before. Cloudflare rejects a used token, but not immediately: the API
remembers the fingerprint of each token for 5 minutes and refuses it by itself.

| Code | Status | Meaning |
|---|---|---|
| `CAPTCHA_REQUIRED` | 403 | No token |
| `CAPTCHA_INVALID` | 403 | Forged token, or issued for another site or action |
| `CAPTCHA_EXPIRED` | 403 | Expired (300 s) or already used |
| `CAPTCHA_UNAVAILABLE` | 503 | Cloudflare unreachable, too slow (5 s), in error, or wrong secret key |
| `RATE_LIMITED` | 429 | Existing limits, or 300 refused tokens from this address in 15 minutes |

Refusals are written to the audit log (`ACCESS_DENIED`), without the token; a blocked address or an outage is written
once per address every 15 minutes. A refused token counts in its own window for the IP address: it uses neither the
10 failures of the account (a bot without a valid token cannot lock it) nor the 100 wrong passwords of the address. An
outage does not count in that window. The limit of 5 attempts per minute for one username from one address applies
first, in all cases.

To protect another public endpoint later: `@CaptchaAction('<action>')` and `@UseGuards(…, CaptchaGuard)` on the
route, a `captchaToken` field in its DTO, and `useCaptcha('<action>')` in its form.

## Before enabling

1. **School decision** and entry in the processing register (record below).
2. **Internet access is required**, from the browser and from the server. If Cloudflare cannot be reached, **nobody
   can sign in**: a communication error is never taken for a success. Open sessions continue. This matters for a
   [school server](deploiement-ecole-local.md): see "Emergency" below.
3. The server must be able to reach `https://challenges.cloudflare.com` (outgoing, port 443).

## Creating the widget and getting the keys

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/), then **Turnstile > Add widget**. The domain
   does not have to be hosted by Cloudflare.
2. **Widget name**: for example "School – sign-in".
3. **Hostname management**: the exact value of `DOMAIN`, without `https://`, port or path. Do not add `localhost` to
   the production widget.
4. **Widget mode**: **Managed**. **Pre-clearance**: No.
5. **Create**, then copy the **Site Key** (public) and the **Secret Key**.

Use one widget per environment. To replace the secret key, use the widget's settings ("Rotate secret key"), then
restart the API with the new value.

## Environment variables

| Variable | Read by | Visibility |
|---|---|---|
| `TURNSTILE_SITE_KEY` | API (and Caddy, for the content security policy) | Public: sent to browsers |
| `TURNSTILE_SECRET_KEY` | API only | **Secret**: never in the browser, in Git or in the logs |

Set **both or none**; an empty value means unset. The API refuses to start, naming the variable but never its value,
if only one is set, if a value is malformed or still the example, if both are equal, if a Cloudflare test key is
mixed with a real one, and **if a test key is used in production**.

**Do not swap the two keys**: the one in `TURNSTILE_SITE_KEY` is sent to everybody. If it happens, rotate the secret
key.

The public key is served by the API at run time: one web image for all environments, no rebuild.

## Enabling in development

In `backend/.env` (ignored by Git), with the [official test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/):

```text
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Restart the API. To see other situations, change one of the two keys:

| Key | Result |
|---|---|
| Site key `2x00000000000000000000AB` | The widget always fails |
| Site key `3x00000000000000000000FF` | The widget always shows its checkbox |
| Secret key `2x0000000000000000000000000000000AA` | The API always answers `CAPTCHA_INVALID` |
| Secret key `3x0000000000000000000000000000000AA` | The API always answers `CAPTCHA_EXPIRED` (already used) |

With test keys, the host name, the action and the local reuse check are skipped: Cloudflare returns a constant token
and `example.com`.

## Enabling in production

1. In `deploy/.env` (`chmod 600`, never committed):

   ```text
   TURNSTILE_SITE_KEY=<site key>
   TURNSTILE_SECRET_KEY=<secret key>
   ```

2. Restart: `deploy/deploy.sh --no-pull`, or on a school server
   `COMPOSE_OVERRIDE_FILE=deploy/docker-compose.school.yml deploy/deploy.sh --no-pull`. The API reads both keys; Caddy
   then adds `https://challenges.cloudflare.com` to `script-src` and `frame-src`, and nowhere else. Pages opened
   before the restart keep the old policy: they must be reloaded once (« Relancer la vérification » does it).
3. Check, **keeping one administrator session open** until it is done:

   ```text
   curl -s https://<domain>/api/auth/captcha
   curl -sI https://<domain>/ | grep -i content-security-policy
   curl -s -X POST https://<domain>/api/auth/login -H "Origin: https://<domain>" \
     -H "Content-Type: application/json" -d '{"username":"x","password":"x"}'
   ```

   Expected: the site key; `challenges.cloudflare.com` in the policy; `CAPTCHA_REQUIRED`.
4. Sign in from a private window, on a computer and on a phone.

If the page always shows « La vérification anti-robot n’a pas pu démarrer », read the error code in the browser
console: `110200` means that `DOMAIN` is missing from the widget's host names, `110100` or `110110` a wrong site key
([all codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)). If every
sign-in answers `CAPTCHA_INVALID`, check that both keys come from the same widget. If it answers
`CAPTCHA_UNAVAILABLE`, read the API log: `invalid-input-secret` means a wrong secret key, an error name
(`TypeError`, `TimeoutError`) means that Cloudflare could not be reached.

## Emergency: Cloudflare or Internet is down

Empty both variables in `deploy/.env`, then recreate the two services (a simple `restart` does not read the file
again; `--no-build` needs no Internet access). On a school server, add `-f deploy/docker-compose.school.yml`:

```text
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --no-build api caddy
```

Sign-in works again without CAPTCHA, still protected by the rate limits. People whose page shows an error click
« Relancer la vérification », or try again. Put the keys back once the outage is over.

## Tests and verification

Automated tests never call Cloudflare and never use real keys; `backend/.env` is ignored for these variables.

```text
npm exec -w backend -- jest -c jest.config.ts turnstile login-attempt config.spec
npm run -w backend test:integration -- captcha.spec
npm run -w frontend test -- tests/auth
npx playwright test -c e2e/playwright.config.ts captcha.spec.ts
```

Manual check with the real Cloudflare service: start the end-to-end stack with test keys, then open
`http://127.0.0.1:5174/connexion` (account `enseignante`, password in `e2e/support/accounts.ts`):

```text
E2E_TURNSTILE_SITE_KEY=1x00000000000000000000AA E2E_TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA \
  PORT=3100 APP_ORIGIN=http://127.0.0.1:5174 npm run -w backend e2e:server
API_URL=http://localhost:3100 npm run -w frontend dev -- --host 127.0.0.1 --port 5174 --strictPort
```

## Processing register record

| Item | Content |
|---|---|
| Purpose | Protect the sign-in form against bots and automated attacks. |
| Data subjects | Anyone who opens the sign-in page (staff and parents). |
| Data | Collected by Cloudflare in the browser: IP address, browser and device characteristics, interaction signals. The server sends only the token and the secret key: no username, no IP address. |
| Recipient | Cloudflare, Inc. (processor, United States and worldwide network). See the [Turnstile privacy addendum](https://www.cloudflare.com/turnstile-privacy-policy/). |
| Retention | Cloudflare: see the addendum. Application: token fingerprint in memory for 5 minutes; refusals in the audit log. |
| Activation | On the school's decision, after this record is added to the register and people are informed. |
