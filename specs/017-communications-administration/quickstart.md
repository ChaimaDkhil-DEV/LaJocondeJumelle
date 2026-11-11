# Quickstart — validating 017

## Prerequisites

- Local database on port 5433 (`npm run -w backend db:dev`), `backend/.env` as usual.
- Migrations applied on the **development database only**:
  `npm exec -w backend -- prisma migrate dev --name communications_enums` then `… communications_conversations`
  (written as complete `migration.sql` files; the project hook applies them), then
  `npm exec -w backend -- prisma migrate status` → « Database schema is up to date! ».
- Demo data: `npm run -w backend db:seed:demo` (accounts and `DEMO_PASSWORD`, see README).

## Migration check (legacy data)

Before migrating, note the counts; after, run (psql or `prisma db execute`):

```sql
SELECT count(*) FROM "ParentCommunication" WHERE "conversationId" IS NULL;           -- 0
SELECT status, count(*) FROM "ParentCommunication" GROUP BY status;                  -- identical to before
SELECT count(*) FROM "Conversation" WHERE type = 'LEGACY_TEACHER_PARENT';            -- = distinct trios before
SELECT count(*) FROM "Conversation" WHERE type = 'LEGACY_TEACHER_PARENT' AND status <> 'CLOSED'; -- 0
```

Inserting a message into a legacy conversation must fail (trigger). Rollback rehearsal: run
`0026/down.sql` then `0025/down.sql` on a copy, the 015 counts are unchanged.

## Automated checks (CI order)

```text
npm run lint
npm run -w backend typecheck && npm run -w frontend typecheck
npm run -w backend test                 # domain: access policy (12 rules), send mode, state machine
npm run -w backend test:integration     # communications-*.spec.ts, migration spec, n8n, files
npm run -w frontend test                # screens, a11y (axe)
npm audit --audit-level=high
npm run test:e2e -- e2e/communications.spec.ts   # three interfaces, desktop + phone
```

## Manual journeys (demo accounts)

1. **Teacher**: « Communications » → « Nouveau message » → pick a student → record 5 s → « Envoyer ».
   Expect: sent in ≤ 3 taps after the student choice; conversation in « Mes conversations », status « Envoyé ».
2. **Admin**: bell « Nouveau signalement » → « Boîte de réception » shows Interne / teacher / student / class /
   time; play the voice inline; answer by text. Teacher sees « Administration (Prénom Nom) », unread mark.
3. **Admin**: in that conversation « Contacter le parent » → student and guardian preselected, empty message.
   - With an admin holding only « Soumettre pour validation »: message goes to « À valider »; the parent sees
     nothing; a second admin approves → the parent sees it signed « L'école », bell notification, outbox event.
   - The author tries to approve their own message → refused.
   - Grant « Envoyer directement aux parents » in « Réglages › Permissions par rôle »: the next message is
     sent directly.
4. **Parent**: « Messages de l'école » → « Nouvelle conversation » → choose the child → record → send. Admin
   inbox shows « Famille ». The parent never sees any internal conversation (try its id in the address: « not
   found »).
5. **Closure**: admin closes the parent conversation → parent and admin cannot post; admin reopens → works.
6. **Archive**: a 015 conversation opens read-only for admin (all statuses), guardian (approved teacher
   messages + own), teacher (own + approved guardian messages); no message box.
7. **Phone width (360 px)** and keyboard only: each journey above, no horizontal scroll, recorder and audio
   player usable with the keyboard, statuses announced.
