# Communications (specs 015 and 017)

Since 017, **the administration is the only bridge between teachers and parents**: no teacher and no parent
ever exchange messages directly. One module, one menu entry « Communications » (teachers and administration);
the parent keeps « Messages de l’école ». Specifications:
[specs/017-communications-administration/spec.md](../specs/017-communications-administration/spec.md) (current),
[specs/015-communication-parents/spec.md](../specs/015-communication-parents/spec.md) (history).

Two conversation types, about one student each:

| Type | Between | Sending |
|---|---|---|
| **Interne** (`INTERNAL`) | one teacher ↔ the administration | direct, both ways |
| **Famille** (`PARENT`) | the administration ↔ one guardian with an active parent account | parent → school: direct; school → parent: direct with « Envoyer directement aux parents », otherwise submitted to **another** validator |
| **Archive** (`LEGACY_TEACHER_PARENT`) | pre-017 teacher ↔ guardian exchanges | read-only, nobody can post |

A message is a voice recording, a text, or both. External notifications (email, WhatsApp Business Platform)
are optional and go through n8n: they only invite the parent to sign in, signed « L’école »; neither the text
nor the voice ever leaves the application.

## Roles and rights

| Who | Can |
|---|---|
| Teacher (member of the « Enseignants » group) | « Communications »: « Nouveau message » (a student of **their assigned classes**, voice first, optional text) and « Mes conversations » (their internal conversations, their archives). Sees administration messages as « Administration (Prénom Nom) ». Never sees a family conversation. |
| Admin and super administrator (active) | « Communications »: « Boîte de réception » (unread messages from teachers and parents), « Nouveau message » (to a teacher of the student's class, or to a guardian with an active account), « Conversations » (search, filters, archives), take responsibility, close and reopen, « Contacter le parent » from an internal conversation (new family conversation, nothing internal is copied). Also « Administration > Représentants » and « Classes des enseignants ». |
| Permission « Envoyer directement aux parents » (`PARENT_COMM_SEND_DIRECT`) | Messages to parents are sent at once. Super administrator: always. |
| Permission « Soumettre ses messages aux parents pour validation » (`PARENT_COMM_SUBMIT_FOR_APPROVAL`) | Messages to parents wait in « À valider ». Granted to the ADMIN role by default. Without either permission, an admin cannot write to parents. |
| Validator: permission « Valider les communications aux parents » (super administrator always) | « À valider »: approve, return (reason required), reject (reason required). **Never their own message.** |
| Parent (role `PARENT`) | « Messages de l’école » only: their family conversations and archives, « Nouvelle conversation » (child chosen first), answer by voice or text. Sees « L’école », never an administrator's name. Every other page and API route is refused (403); an internal conversation answers « not found ». |

Permissions per role: « Administration > Réglages > Permissions par rôle » (super administrator).

## Setting up (administration)

1. « Classes des enseignants »: tick each teacher's classes. Without classes a teacher sees no students.
2. « Représentants »: create each guardian (first and last name, relationship, email and/or phone for external
   notifications), link their children (several guardians per student are allowed).
3. « Créer le compte parent »: choose a username; the temporary password is shown **once**. Hand it over to the
   parent; they must change it at first sign-in. A guardian without an active account cannot be written to.

## Lifecycle

Direct messages (teacher, parent, admin with direct sending): `SENT` at once, final.

Admin → parent, submitted: `PENDING_ADMIN_VALIDATION` → approve (another validator) → `APPROVED` (published, final)
`PENDING_ADMIN_VALIDATION` → return → `RETURNED_FOR_CORRECTION` → the author corrects and submits again (new numbered version)
`PENDING_ADMIN_VALIDATION` → reject → `REJECTED` (final); `RETURNED_FOR_CORRECTION` → cancel → `CANCELLED`

- Rights are checked again at every sending and decision: a teacher who lost the class, a guardian unlinked or
  without an active account can still read, no longer write.
- A closed conversation is read-only for everyone; only the administration reopens it. A decision is refused
  while the conversation is closed. The database itself refuses messages in a closed conversation or an archive.
- Each submission freezes a numbered version; the decision applies to the version displayed (« La communication
  a changé… » otherwise).
- Bell notifications: administration on a teacher or parent message; teacher on an administration message;
  validators on a submission; the author on return, approval or rejection; the parent's account when a message
  becomes visible. Never pushed to phones (spec 014).
- Every action is in the audit log (messages, decisions, reads by parents, close, reopen, responsible, link, n8n).
- Archives (015 data, migration `0026`): the administration sees every message; the teacher their own messages and
  the guardian's approved ones; the guardian the teacher's approved messages and their own. Pending 015 messages
  are frozen and never sent.

Voice files use the existing pipeline (real type checked, limits from « Réglages »), are stored outside the web
root and are served only to readers of the message that holds them.

## External notifications with n8n

### How it works

1. When a message to a parent becomes visible (sent directly or approved), the transaction writes an **outbox
   event** (once, even on a double click or a replay).
2. The API (job every 15 s) sends `{eventId, type, communicationId, occurredAt}` to the n8n webhook over the
   private Docker network, signed with HMAC-SHA256 (`X-LJJ-Timestamp`, `X-LJJ-Signature`). On failure it
   retries after 30 s, 1 min, 2 min… up to 1 h, 8 attempts at most; the event then stays `FAILED`.
3. The n8n workflow checks the signature and the timestamp (5 min), ignores an event already processed, then
   asks `GET /api/integrations/n8n/parent-communications/:id` (bearer secret) for the minimal data: guardian's
   name, email and/or phone for the enabled channels, student's first name, `senderName: "L’école"`, link to the
   conversation (`/messages-ecole/conversations/:id`).
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

Deployment: [docs/procedure-fusion.md](procedure-fusion.md) then `deploy/deploy.sh`. The API applies the
migrations (015: `0020` to `0023`; 017: `0025` to `0027`) only after a recent backup.

Rollback, in this order:

1. Disable the feature without touching the data: empty `N8N_WEBHOOK_URL`, `N8N_SHARED_SECRET` and
   `PARENT_COMM_CHANNELS`, remove `n8n` from `COMPOSE_PROFILES`, `deploy/deploy.sh --no-pull`. Approved messages
   stay readable by parents.
2. Previous code: `git checkout <previous commit>` then `deploy/deploy.sh --no-pull`. The new tables stay unused.
3. Schema, only if required and after a backup, in reverse order:
   - 017: `0027_communications_voice_only/down.sql`, then `0026_communications_conversations/down.sql`, then
     `0025_communications_enums/down.sql`. They bring back the exact 015 schema and data, but **refuse** as soon
     as a 017 conversation (internal or family) or a voice-only message exists: then restore the backup taken
     before migration `0026`.
   - 015: `0021_parent_communications_integrity/down.sql`, then `0020_parent_communications/down.sql`. **This
     deletes every communication, guardian and parent account.** Otherwise restore the backup taken before the
     migration.

## Processing register record

| Item | Content |
|---|---|
| Purpose | Let teachers report to the administration about a student (internal conversations), and let the administration and legal guardians exchange about the child (family conversations), by text and voice messages; the administration is the only intermediary. |
| Data subjects | Students (subject of the conversation), legal guardians, teachers, members of the administration (authors and validators). |
| Data | Guardian: first and last name, relationship, email, phone, linked students, parent account (username, password hash, sessions). Conversations: type, student, teacher (internal) or guardian (family), responsible administrator, status, closure. Messages: text, voice recording, versions, statuses, reasons, dates, read date. Audit trail of every action. |
| Recipients | Internal conversations: the teacher and the administration only. Family conversations: the guardian (messages sent directly or approved only) and the administration; teachers never. External notification (optional): the school's mail server, and Meta (WhatsApp Business Platform) as processor, which receive the guardian's name, email or phone, the student's first name, the sender « L’école » and a link, never the text nor the voice. n8n is self-hosted on the school's server. |
| Retention | To be decided by the school (e.g. end of the school year + 1 year), then deletion. n8n: successful executions not kept, failures 14 days; backups 14 days. |
| Rights | Access and rectification through the administration; the parent reads their messages in « Messages de l’école ». |
| Activation | External channels only after this record is added to the register and, for WhatsApp, after the agreement with Meta. |

## Checking

Results of the automated checks and of the workflow test against a real n8n:
[docs/validation/verification-015.md](validation/verification-015.md).
