# Quickstart — 007 Brouillons de demande de travail (Work request drafts)

Contracts: [contracts/rest-api.md](./contracts/rest-api.md), [contracts/ui.md](./contracts/ui.md).

## Prerequisites

- `npm ci`, development application running (`start.bat`), demo seed.
- Accounts: `enseignante` (author), `reprographie` (recipient of « Photocopies »), `superadmin`
  (settings).

## Automated checks

```text
npm run verify
npm run -w backend typecheck
npm run -w frontend typecheck
npm run test:e2e
```

## Scenarios

1. **Save as a draft (US1, FR-001 to FR-003)** — as `enseignante`, « Nouvelle demande »:
   category « Photocopies », title, voice message → « Enregistrer en brouillon »; « Brouillon
   enregistré. »; `reprographie` receives no notification and sees nothing.
2. **Reduced validation (US1 scenario 2)** — without a title → « Saisissez un titre. », nothing saved.
3. **Tab (US2, FR-004, FR-004b)** — « Mes demandes »: « Brouillons » tab present with the
   draft; « Envoyées » does not contain it; with no draft, no tab.
4. **Resume and send (US2, FR-005 to FR-007, SC-003)** — open the draft: pre-filled form,
   voice message replayable; complete the description; « Envoyer la demande » → detail of the
   « Envoyée » request; `reprographie` notified as for a direct creation.
5. **Incomplete submission (US2 scenario 4)** — draft with no description or voice message → message, nothing sent.
6. **Delete (US3)** — « Supprimer le brouillon » → confirmation → « Brouillon supprimé. »;
   cancelling the confirmation deletes nothing.
7. **Disabled setting (FR-001, FR-008)** — as `superadmin`, disable « Autoriser les brouillons
   de demande » (Allow request drafts); « Enregistrer en brouillon » disappears; an existing draft stays openable,
   saveable, sendable and deletable.
8. **Accessibility (FR-010, SC-005)** — keyboard only, 320 px, axe with no violation.
