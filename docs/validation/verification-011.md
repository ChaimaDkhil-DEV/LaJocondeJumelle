# Verification — assistance without a subscription (rules, local Whisper)

Branch `011-assistance-regles-whisper-local`, created from `master` (`cac29f1`, merge of #42).
Specification: `specs/010-assistance-fournisseurs-similaires/` (US5, US6, FR-013 to FR-017,
research R9 to R11, tasks T020 to T027).

## Results of 29/10/2026 (executed)

| Step | Command | Result |
|-------|----------|----------|
| Lint | `npm run lint` | no errors |
| Types | `npm run -w backend typecheck`, `npm run -w frontend typecheck` | no errors |
| Backend unit | `npm test -w backend` | 688 / 688 (39 suites) |
| Backend integration | `npm run -w backend test:integration` | 694 passed, 1 skipped (real Whisper test, without `ASSIST_WHISPER_TEST_URL`) |
| Frontend | `npm test -w frontend` | 328 / 328 |
| Assistance E2E | `assist.spec.ts` (chromium, mobile-320) | 6 / 6 |
| Dependencies | `npm audit --audit-level=high` | 16 vulnerabilities, 4 "high" pre-existing (`multer`, `body-parser`, `undici`), none new |
| Compose (syntax) | YAML parsing (Node) | valid; `whisper` with no published port in production, `127.0.0.1:8000` in development; Caddy's published ports unchanged (80, 443) |

## Whisper image chosen

`ghcr.io/speaches-ai/speaches:0.8.3-cpu@sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8`
(latest stable version published; tag and digest read from the GHCR registry on 29/10/2026).

## Existing limits documented

- Voice message length: `voiceMaxSeconds` 180 s by default (10 to 600 s, setting), 2 s tolerance;
  size `voiceMaxBytes`; technical upload limit 25 MB. Unchanged.
- Timeouts: suggestions `ASSIST_TIMEOUT_MS` (15 s, 20 s at most); transcription
  `ASSIST_TRANSCRIPTION_TIMEOUT_MS` (120 s by default, **provisional**, 300 s at most); Node
  `requestTimeout` 300 s (request reception); no timeout on the browser or Caddy side.
- Call limit: 10 per 5 minutes per user (transcription and suggestions combined).

## Docker and Caddy (executed on 29/10/2026)

Docker 29.9.2, Compose v5.6.1; Docker virtual machine: 4 processors, 5.7 GB.

| Check | Result |
|--------------|----------|
| `docker compose -f deploy/docker-compose.dev.yml config` | valid |
| `docker compose -f deploy/docker-compose.yml --profile whisper config` (dummy secrets) | valid; only 80 and 443 published, `whisper` with no published port, API to `https://caddy:8444` |
| `caddy validate` on `deploy/Caddyfile` (image `caddy:2`) | "Valid configuration" |
| Model download: `POST /v1/models/Systran/faster-whisper-small` | confirmed: HTTP 200 in 331 s, 464 MB in the models volume |

## T026 — real measurement (executed on 29/10/2026)

`whisper` server from `docker-compose.dev.yml` (`127.0.0.1:8000`), model
`Systran/faster-whisper-small`, CPU only (Intel N95), same fields as the connector
(`language=fr`, `response_format=json`). Audio from Windows speech synthesis (Hortense voice), fictitious
texts, no personal data.

| Audio | Transcription time |
|-------|------------------------|
| 4.5 s sentence, first call (test `assist-whisper-live.spec.ts`, through the API) | 43.1 s (model loading included) |
| 4.5 s sentence, model loaded (3 attempts) | 7.5 to 8.7 s |
| 179.5 s voice message, model loaded (2 attempts) | 136.8 and 159.5 s |

- Real test `assist-whisper-live.spec.ts`: passed, exact text ("La photocopieuse du premier
  étage est en panne depuis ce matin." — The photocopier on the first floor has been out of order since this morning.), no file kept.
- Quality on the 179.5 s voice message: about 4% word errors (379 words), mostly
  homophones ("raid chaussée", "salle douce", "late").
- The 179.5 s voice message (text and audio) stays outside the repository.
- **Consequence**: a 180 s voice message exceeds the default timeout of 120 s
  (`ASSIST_TRANSCRIPTION_TIMEOUT_MS`) on this machine; the default value needs to be raised.

## Pending

- Internal HTTPS relay and internal authority certificate, full production stack.
- Default value of `ASSIST_TRANSCRIPTION_TIMEOUT_MS` to be set based on the measurement above.
