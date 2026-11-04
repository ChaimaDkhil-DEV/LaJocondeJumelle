# Quickstart: real providers and similar requests (010)

## Automated verification (no external call)

```text
npm run lint
npm run -w backend typecheck
npm test -w backend                       # simulated connectors, configuration
npm run -w backend test:integration       # similar requests and rights
npm test -w frontend                      # « Demandes similaires » section, transcription replaced
npx playwright test -c e2e/playwright.config.ts assist.spec.ts
```

## Local demonstration (`demo` provider)

1. `backend/.env`: `ASSIST_SUGGESTION_PROVIDER=demo`, `ASSIST_TRANSCRIPTION_PROVIDER=demo`.
2. With one account, create a request « Photocopieuse du premier étage en panne » (First-floor
   copier out of order).
3. With the same account, « Nouvelle demande » (New request), description « la photocopieuse du
   premier étage ne marche plus » (the first-floor copier no longer works), « Proposer… »
   (Suggest…): the previous request appears in « Demandes similaires » (Similar requests).
4. With an account that cannot see this request: it does not appear.

## Enabling the real connectors (after the school's decision)

- Transcription: install an OpenAI-compatible Whisper server on the school's infrastructure,
  then `ASSIST_TRANSCRIPTION_PROVIDER=whisper`, `ASSIST_WHISPER_URL=https://…`,
  optionally `ASSIST_WHISPER_MODEL`, `ASSIST_WHISPER_API_KEY`.
- Analysis: `ASSIST_SUGGESTION_PROVIDER=claude`, `ANTHROPIC_API_KEY=…` (secret, never committed),
  optionally `ASSIST_CLAUDE_MODEL`.
- An incomplete configuration prevents the API from starting, with an explicit message.

## Without a subscription: rules and local Whisper (011 addition)

### Development (Windows machine with Docker Desktop)

> Model download commands to be confirmed during the real trial (T026); the result
> is recorded in `docs/validation/verification-011.md`.

```text
docker compose -f deploy/docker-compose.dev.yml --profile whisper up -d whisper
curl -X POST http://127.0.0.1:8000/v1/models/Systran/faster-whisper-small   # model download (once)
```

`backend/.env`:

```text
ASSIST_SUGGESTION_PROVIDER=rules
ASSIST_TRANSCRIPTION_PROVIDER=whisper
ASSIST_WHISPER_URL=http://127.0.0.1:8000
```

Optional real test (the server above must be running):

```text
ASSIST_WHISPER_TEST_URL=http://127.0.0.1:8000 npx jest -c backend/test/jest-integration.config.ts --runInBand backend/test/integration/assist-whisper-live.spec.ts
```

### Production

`deploy/.env`: `ASSIST_SUGGESTION_PROVIDER=rules`, `ASSIST_TRANSCRIPTION_PROVIDER=whisper` (default address and
certificate: Caddy's internal HTTPS relay), then:

```text
docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile whisper up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec whisper curl -X POST http://localhost:8000/v1/models/Systran/faster-whisper-small
```

Whisper's port is never published; only the private Docker network reaches `https://caddy:8444`.
