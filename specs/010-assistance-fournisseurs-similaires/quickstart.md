# Quickstart: fournisseurs réels et demandes similaires (010)

## Vérification automatique (aucun appel externe)

```text
npm run lint
npm run -w backend typecheck
npm test -w backend                       # connecteurs simulés, configuration
npm run -w backend test:integration       # demandes similaires et droits
npm test -w frontend                      # section « Demandes similaires », transcription remplacée
npx playwright test -c e2e/playwright.config.ts assist.spec.ts
```

## Démonstration locale (fournisseur `demo`)

1. `backend/.env` : `ASSIST_SUGGESTION_PROVIDER=demo`, `ASSIST_TRANSCRIPTION_PROVIDER=demo`.
2. Créer avec un compte une demande « Photocopieuse du premier étage en panne ».
3. Avec le même compte, « Nouvelle demande », description « la photocopieuse du premier étage ne
   marche plus », « Proposer… » : la demande précédente apparaît dans « Demandes similaires ».
4. Avec un compte qui ne voit pas cette demande : elle n'apparaît pas.

## Activation des connecteurs réels (après décision de l'établissement)

- Transcription : installer un serveur Whisper compatible OpenAI sur l'infrastructure de l'école,
  puis `ASSIST_TRANSCRIPTION_PROVIDER=whisper`, `ASSIST_WHISPER_URL=https://…`,
  éventuellement `ASSIST_WHISPER_MODEL`, `ASSIST_WHISPER_API_KEY`.
- Analyse : `ASSIST_SUGGESTION_PROVIDER=claude`, `ANTHROPIC_API_KEY=…` (secret, jamais commité),
  éventuellement `ASSIST_CLAUDE_MODEL`.
- Une configuration incomplète empêche l'API de démarrer, avec un message explicite.

## Sans abonnement : règles et Whisper local (complément 011)

### Développement (poste Windows avec Docker Desktop)

> Commandes de téléchargement du modèle à confirmer lors de l'essai réel (T026) ; le résultat
> est consigné dans `docs/validation/verification-011.md`.

```text
docker compose -f deploy/docker-compose.dev.yml --profile whisper up -d whisper
curl -X POST http://127.0.0.1:8000/v1/models/Systran/faster-whisper-small   # téléchargement du modèle (une fois)
```

`backend/.env` :

```text
ASSIST_SUGGESTION_PROVIDER=rules
ASSIST_TRANSCRIPTION_PROVIDER=whisper
ASSIST_WHISPER_URL=http://127.0.0.1:8000
```

Test réel facultatif (le serveur ci-dessus doit tourner) :

```text
ASSIST_WHISPER_TEST_URL=http://127.0.0.1:8000 npx jest -c backend/test/jest-integration.config.ts --runInBand backend/test/integration/assist-whisper-live.spec.ts
```

### Production

`deploy/.env` : `ASSIST_SUGGESTION_PROVIDER=rules`, `ASSIST_TRANSCRIPTION_PROVIDER=whisper` (adresse et
certificat par défaut : relais HTTPS interne de Caddy), puis :

```text
docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile whisper up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec whisper curl -X POST http://localhost:8000/v1/models/Systran/faster-whisper-small
```

Le port de Whisper n'est jamais publié ; seul le réseau Docker privé joint `https://caddy:8444`.

