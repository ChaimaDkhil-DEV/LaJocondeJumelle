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
