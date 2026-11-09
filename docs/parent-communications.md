# Teacher–parent communication (spec 015)

A teacher writes a remark and records a voice message about one of their students for a legal guardian. An
authorised member of the administration examines exactly the submitted version, then approves, returns it for
correction or rejects it. **Nothing reaches a parent, inside or outside the app, before an explicit approval.**
The parent then reads and listens to the message in their own space, « Messages de l’école ». Specification:
[specs/015-communication-parents/spec.md](../specs/015-communication-parents/spec.md).

External notifications (email, WhatsApp Business Platform) are optional and go through n8n. They only invite
the parent to sign in: neither the remark nor the voice message ever leaves the application.

## Roles and rights

| Who | Can |
|---|---|
| Teacher (member of the « Enseignants » group) | Write to the guardians of the students of **their assigned classes** only: draft, record, listen, re-record, submit, cancel, correct after a return. Menu « Parents ». |
| Validator: super administrator (always), or admin with the permission « Valider les communications aux parents » | List and filter (status, teacher, class, student, dates), examine the submitted version, approve, return (reason required), reject (reason required). Menu « À valider ». Never their own communication. |
| Admin and super administrator | « Administration > Représentants » (guardians, linked students, parent account) and « Administration > Classes des enseignants ». |
| Parent (role `PARENT`, account created by the administration) | « Messages de l’école » only: approved messages addressed to them. Every other page and API route is refused (403). |

Granting the permission to admins: « Administration > Réglages > Permissions par rôle » (super administrator).

## Setting up (administration)

1. « Classes des enseignants »: tick each teacher's classes. Without classes a teacher sees no students.
2. « Représentants »: create each guardian (first and last name, relationship, email and/or phone for external
   notifications), link their children (several guardians per student are allowed).
3. « Créer le compte parent »: choose a username; the temporary password is shown **once**. Hand it over to the
   parent; they must change it at first sign-in. Deactivating a guardian deactivates the account and closes its
   sessions.

## Lifecycle

`DRAFT` → submit → `PENDING_ADMIN_VALIDATION` → approve → `APPROVED` (published, final)
`PENDING_ADMIN_VALIDATION` → return → `RETURNED_FOR_CORRECTION` → edit and submit again (new numbered version)
`PENDING_ADMIN_VALIDATION` → reject → `REJECTED` (final); `DRAFT` or `RETURNED_FOR_CORRECTION` → cancel → `CANCELLED`

- Submitting requires both the written remark and the voice message.
- Each submission freezes a numbered version; the decision applies to the version displayed. If the teacher or
  another validator changed something meanwhile, the decision is refused (« La communication a changé… »).
- Bell notifications: to validators on submission; to the teacher on return, approval or rejection; to the
  parent's account on approval. They are never pushed to phones (spec 014): they stay in the bell.
- Every action is in the audit log (create, edit, submit, decide, parent read, n8n data read and reports).

Voice files use the existing pipeline (real type checked, limits from « Réglages »), are stored outside the web
root and are served only through the API to the author, validators and the addressed parent after approval.

## External notifications with n8n

### How it works

1. The approval transaction writes an **outbox event** (once, even on a double click or a replay).
2. The API (job every 15 s) sends `{eventId, type, communicationId, occurredAt}` to the n8n webhook over the
   private Docker network, signed with HMAC-SHA256 (`X-LJJ-Timestamp`, `X-LJJ-Signature`). On failure it
   retries after 30 s, 1 min, 2 min… up to 1 h, 8 attempts at most; the event then stays `FAILED`.
3. The n8n workflow checks the signature and the timestamp (5 min), ignores an event already processed, then
   asks `GET /api/integrations/n8n/parent-communications/:id` (bearer secret) for the minimal data: guardian's
   name, email and/or phone for the enabled channels, student's first name, teacher's name, link to the
   message.
4. It sends the email (SMTP) and/or the WhatsApp template message (official WhatsApp Business Platform API of
   Meta, never an unofficial solution), then reports each delivery to
   `POST /api/integrations/n8n/deliveries`. Validators see the status (« Notifications externes »).

**n8n down never blocks the app**: approval and parent reading work as usual; events wait in the outbox and
leave when n8n is back. The browser never talks to n8n.

### Installing n8n (profile `n8n` of `deploy/docker-compose.yml`)

Services: `n8n` (image pinned by digest, 1 CPU / 1 GB), `n8n-db` (dedicated PostgreSQL 17, 0.5 CPU / 512 MB),
`n8n-backup` (daily dump of the n8n database and of `/home/node/.n8n`, same scripts and 14-day rotation as the
app, in `BACKUP_DIR/n8n` and `BACKUP_OFFSITE_DIR/n8n`). Volumes `n8n_data`, `n8n_pgdata`. No published port.

1. DNS: an `A`/`AAAA` record for the n8n subdomain (e.g. `n8n.ecole.example`) pointing to the server. Caddy
   obtains its HTTPS certificate.
2. In `deploy/.env` (see `deploy/.env.example`):

   ```text
   COMPOSE_PROFILES=n8n
   N8N_ENCRYPTION_KEY=<openssl rand -hex 32>   # keep a copy OUTSIDE the server
   N8N_POSTGRES_PASSWORD=<openssl rand -hex 24>
   N8N_SHARED_SECRET=<openssl rand -hex 32>
   N8N_WEBHOOK_URL=http://n8n:5678/webhook/ljj-parent-communication
   PARENT_COMM_CHANNELS=EMAIL                  # or EMAIL,WHATSAPP
   N8N_DOMAIN=n8n.ecole.example
   N8N_ALLOWED_IPS=<administrator IP>/32       # default 127.0.0.1/32: SSH tunnel only
   N8N_MAIL_FROM=ne-pas-repondre@ecole.example
   ```

   n8n refuses to start without an encryption key and a shared secret of 32 characters or more. The API stops
   at startup if only one of `N8N_WEBHOOK_URL` / `N8N_SHARED_SECRET` is set, or if the secret is too short.
3. Deploy: `deploy/deploy.sh` (backup first, then `up -d --build`). Check: `docker compose -f
   deploy/docker-compose.yml --env-file deploy/.env ps` shows `n8n`, `n8n-db` healthy.
4. Open `https://<N8N_DOMAIN>` from an allowed address (or `ssh -L 5678:…` tunnel) and create the n8n owner
   account (strong password, then enable two-factor authentication in the n8n settings).
5. Import the workflow:

   ```text
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec n8n \
     n8n import:workflow --input=/workflows/ljj-parent-communication.workflow.json
   ```

6. In n8n, create the credentials and select them in the workflow:
   - « LJJ SMTP » (type SMTP): the school's mail server;
   - « WhatsApp Business Platform » (type Header Auth): name `Authorization`, value `Bearer <permanent token of
     the Meta system user>`; plus `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`
     in `deploy/.env`. The template must be approved by Meta, in French, with three body variables: guardian's
     first name, student's first name, link.
7. Publish (activate) the workflow, then approve a test communication for a test guardian and check
   « Notifications externes » on the validation page.

Only enable `WHATSAPP` in `PARENT_COMM_CHANNELS` once the template and the token work. A channel the guardian
has no contact for is skipped.

### Operating

- Webhooks are never exposed on the subdomain (`/webhook/*` → 404): only the API calls them, internally.
- Successful n8n executions are not kept (they contain addresses and numbers); failed ones are kept 14 days.
- Rotating `N8N_SHARED_SECRET`: change it in `deploy/.env` and redeploy; the API and n8n read the same
  variable. Events sent with the old secret are retried and accepted with the new one.
- Never change `N8N_ENCRYPTION_KEY` of an existing installation: n8n could no longer decrypt its credentials.
- Restoring n8n: stop `n8n`, restore `BACKUP_DIR/n8n/db-*.dump` into `n8n-db` with `pg_restore --clean`, extract
  `files-*.tar.gz` into the `n8n_data` volume, start `n8n` with the same encryption key.

### Deployment and rollback

Deployment: [docs/procedure-fusion.md](procedure-fusion.md) then `deploy/deploy.sh`. The API applies migrations
`0020_parent_communications` and `0021_parent_communications_integrity` only after a recent backup.

Rollback, in this order:

1. Disable the feature without touching the data: empty `N8N_WEBHOOK_URL`, `N8N_SHARED_SECRET` and
   `PARENT_COMM_CHANNELS`, remove `n8n` from `COMPOSE_PROFILES`, `deploy/deploy.sh --no-pull`. Approved messages
   stay readable by parents.
2. Previous code: `git checkout <previous commit>` then `deploy/deploy.sh --no-pull`. The new tables stay unused.
3. Schema, only if required and after a backup: run `backend/prisma/migrations/0021_parent_communications_integrity/down.sql`,
   then `0020_parent_communications/down.sql`. **This deletes every communication, guardian and parent
   account.** Otherwise restore the backup taken before the migration.

## Processing register record

| Item | Content |
|---|---|
| Purpose | Inform legal guardians about their child's schooling, by a written remark and a voice message of the teacher, after validation by the administration. |
| Data subjects | Students (subject of the message), legal guardians, teachers (authors), validators. |
| Data | Guardian: first and last name, relationship, email, phone, linked students, parent account (username, password hash, sessions). Communication: written remark, voice recording, versions, statuses, reasons, dates, read date. Audit trail of every action. |
| Recipients | The addressed guardian (after approval only); the author; the school's validators. External notification (optional): the school's mail server, and Meta (WhatsApp Business Platform) as processor, which receive the guardian's name, email or phone, the student's first name, the teacher's name and a link, never the remark nor the voice. n8n is self-hosted on the school's server. |
| Retention | To be decided by the school (e.g. end of the school year + 1 year), then deletion. n8n: successful executions not kept, failures 14 days; backups 14 days. |
| Rights | Access and rectification through the administration; the parent reads their messages in « Messages de l’école ». |
| Activation | External channels only after this record is added to the register and, for WhatsApp, after the agreement with Meta. |

## Checking

Results of the automated checks and of the workflow test against a real n8n:
[docs/validation/verification-015.md](validation/verification-015.md).
