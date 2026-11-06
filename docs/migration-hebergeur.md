# Moving to another server, and going back

This procedure moves the application from one Docker host to another, whichever the provider, and
says how to return to the previous server if the move fails. For a normal update on the same server,
use `deploy/deploy.sh` (see the [quickstart](../specs/001-demandes-travail-vocales/quickstart.md)).

Below, `DC` stands for `docker compose -f deploy/docker-compose.yml --env-file deploy/.env`, run from
the repository root. "Old server" and "new server" are the two hosts.

## What moves

| Item | How it moves |
|------|--------------|
| Database | `db-<timestamp>.dump`, restored with `deploy/backup/restore.sh` |
| Voice messages, photos, documents, avatars | `files-<timestamp>.tar.gz`, restored by the same script |
| `deploy/.env` | Copied by hand: **no backup contains it** |
| Code | Same Git commit, cloned on the new server |
| Images | Rebuilt on the new server |
| HTTPS certificates | Issued again by Caddy once the DNS points to the new server |

**Keep the same `SESSION_SECRET`.** Printed class QR codes are signed with a key derived from it: a new
value invalidates them all, as well as every session. Keep the same `POSTGRES_USER` and `POSTGRES_DB`
too. `POSTGRES_PASSWORD` can differ.

Never run `DC down -v` on either server: it deletes the database and file volumes.

## Before the move

1. **Reduce the DNS TTL** to 300 seconds at least 48 hours before the move, and note the old value.
2. **Prepare the new server:** Docker, Docker Compose, ports 80 and 443 open, read access to the
   repository, and enough disk for the data, the backups and the images.
3. **Clone the repository at the commit of the old server** (`git rev-parse HEAD` there), then copy
   `deploy/.env`.
4. **Rehearse** with a recent backup (see "Transfer and restore"), and note how long it takes. Change
   `DOMAIN` for the rehearsal only, then restore the real value. The rehearsal data is replaced during
   the move.
5. **Choose a quiet time slot** and tell users when the application will be unavailable. Allow for the
   rehearsal duration, plus 30 minutes.
6. **Name who decides** to continue or to go back, and set the time limit for that decision.

## The move

### Freeze the old server

Nothing written after this point would reach the new server.

```bash
DC stop caddy api
git rev-parse --short HEAD
DC run --rm --entrypoint /bin/bash backup /scripts/backup.sh
```

Note the timestamp printed at the end of the backup. **Do not delete anything on the old server.**

### Transfer and restore

Copy the two archives into the backups folder of the new server (`deploy/backups` by default):

```bash
scp deploy/backups/db-<timestamp>.dump deploy/backups/files-<timestamp>.tar.gz new-server:/path/to/repository/deploy/backups/
```

Compare `sha256sum` of both files on each server. Then, on the new server:

```bash
DC up -d db        # wait for "healthy" in DC ps
deploy/backup/restore.sh <timestamp>   # type RESTAURER
DC ps              # every service running, api healthy
```

`restore.sh` runs `pg_restore` without starting the database itself, which is why `db` comes first. If
the new server's code is not the same commit, the API finds a pending migration and may refuse to start.

### Switch the DNS

Point the domain's A and AAAA records to the new server. Caddy needs this to obtain its certificate, so
the application cannot be fully checked over HTTPS before this step.

### Check before reopening

Keep the time limit in mind. Check from a phone and from a computer:

- [ ] the certificate is valid (`curl -I https://<domain>`) and `api` is healthy;
- [ ] login works, with an existing account;
- [ ] the newest request created before the freeze is present;
- [ ] a voice message plays, and a photo displays;
- [ ] a printed class QR code is accepted;
- [ ] the audit log shows events from before the backup;
- [ ] a new request can be created and sent;
- [ ] a real-time notification arrives;
- [ ] a manual backup succeeds: `deploy/backup/check-backup.sh` is then up to date.

If every box is ticked, open the application to users. Otherwise, go back to the old server.

## Going back to the old server

The old server keeps its data and its stopped containers, so the way back depends on one question:
**has anyone used the new server?**

### Case A: no real user wrote on the new server

No data is lost. The test request created during the checks is simply abandoned.

1. Point the DNS back to the old server.
2. On the old server, restart the application:

   ```bash
   DC up -d
   DC ps
   ```

3. Check login, a recent request, a voice message and a photo.
4. On the new server, stop the application: `DC stop caddy api`.

### Case B: users already wrote on the new server

Going back as in case A would **lose everything written since the move**. Choose knowingly:

- **Fix forward on the new server** if the problem can be corrected. This is the preferred option.
- **Bring the data back** otherwise, which needs another interruption:

  1. On the new server: `DC stop caddy api`, then a backup as in "Freeze the old server".
  2. Copy both archives to the old server. Its `deploy/.env` already has the right values.
  3. On the old server, check that the commit is the same as on the new one, then run
     `deploy/backup/restore.sh <timestamp>`.
  4. Point the DNS back to the old server and run the checks above.

Run the code that matches the backup. **Nothing stops older code from starting on a newer database:**
the API starts and stays healthy even if the database has migrations that the code does not know, so
a wrong commit may only show up later, as errors. Rolling a migration back is described in the
quickstart ("Deploying a specific commit") and in each migration's `down.sql`.

## After the move

1. Keep the old server stopped for at least 14 days, the backup retention period, then destroy it and
   its data: it holds personal data.
2. Put the DNS TTL back to its previous value.
3. On the new server, check `BACKUP_OFFSITE_DIR`, the crontab line of `deploy/backup/check-backup.sh`,
   and that `DC ps` shows the `backup` service healthy.
4. Record the date, the durations and any problem in `docs/validation/`.
