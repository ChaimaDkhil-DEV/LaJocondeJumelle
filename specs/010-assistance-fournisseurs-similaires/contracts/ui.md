# UI Contract: similar requests (010)

## « Propositions automatiques » (Automatic suggestions) panel — « Demandes similaires » (Similar requests) section

- Displayed after « Consignes utilisées » (Guidelines used) when `similar` is not empty; absent otherwise.
- Title « Demandes similaires », sentence « Vérifiez qu'il ne s'agit pas d'un doublon. » (Check that it is not a duplicate.).
- List named « Demandes similaires »; each item:
  - link « D-2026-000042 · Photocopieuse du 1er étage en panne » to `/demandes/:id`,
    `target="_blank"`, `rel="noopener"`, hidden mention « (nouvel onglet) » (new tab);
  - secondary line: category · priority (label) · status (label), plain text.
- No action modifies the form; the `assistToken` token is unchanged.

## Transcription

A new recording (or its deletion) hides the previous transcription; the next click
on « Proposer… » requests a new transcription.
