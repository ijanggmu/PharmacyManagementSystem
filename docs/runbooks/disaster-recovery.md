# Disaster recovery runbook

Production is one Docker Compose stack on one VPS (ADR 0005). Paths below assume the deploy directory
`/opt/pharmacy` (`DEPLOY_PATH`), with compose project `fsh` and volumes `fsh_pg_data`, `fsh_redis_data` and `fsh_s3_data`.

## Targets

| | Target | Basis |
|---|---|---|
| **RPO** (max data loss) | **24 hours** | Nightly `pg_dump` (`scripts/backup.sh` from cron). Every deploy also takes a pre-deploy dump. |
| **RTO** (max downtime) | **4 hours** | A new VPS plus a restore of the latest dump, done by hand with this runbook. |

These targets hold only if the nightly cron runs **and** dumps are copied off the server. A dump on the same disk
does not survive host loss.

## What is backed up, and what is not

| Data | Where it lives | Backed up? |
|---|---|---|
| PostgreSQL (all tenants, all modules, Hangfire, Outbox) | `fsh_pg_data` | **Yes.** `scripts/backup.sh`: `pg_dump -Fc --no-owner` → `/var/backups/pharmacy/fsh-<UTC>.dump` (nightly, kept 14 days by default) and `./backups/fsh-predeploy-<UTC>.dump` (each deploy, newest 5 kept). **Off-site only if** `OFFSITE_RCLONE_REMOTE` or `OFFSITE_S3_BUCKET` (+ keys) is set in `.env`. Off-site copies are never pruned by the script. |
| Uploaded files (Files module objects in RustFS bucket `fsh`) | `fsh_s3_data` | **No.** |
| Redis / Valkey (cache, web-app sessions in DB 1, **ASP.NET Data Protection key ring**) | `fsh_redis_data` (AOF on) | **No.** |
| Server `.env` (all secrets: DB/Redis/S3 passwords, JWT key, Hangfire, `OFFSITE_*`) | `/opt/pharmacy/.env` | **No.** Keep a copy in the team password manager. |
| Images | GHCR `ghcr.io/<owner>/pharmacy/*:<sha>` | Yes (registry). `.deployed-tag` names the live sha. |

**Dumps are not encrypted**, locally or off-site. Restrict the off-site bucket (write-only key for the server)
and enable provider-side encryption and versioning.

### KNOWN RISK: Data Protection keys live only in Redis

`src/BuildingBlocks/Caching/Extensions.cs` persists the ASP.NET Data Protection key ring to Redis (key
`DataProtection-Keys`). That key ring encrypts **secrets stored in Postgres**: IRD CBMS credentials
(`Sales/Services/Ird/IrdSecrets.cs`), Fonepay merchant secrets (`Sales/Features/v1/Payments/PaymentSecrets.cs`),
SMS provider credentials (`Notifications/Sms/SmsServices.cs`) and webhook secrets
(`Webhooks/Services/WebhookSecretProtector.cs`). It also covers password-reset/confirmation tokens.

If Redis data is lost (host loss, volume deleted, `FLUSHALL`), **a restored database still contains those
secrets, but nothing can decrypt them.** Every tenant then has to re-enter IRD, Fonepay, SMS and webhook
credentials.

**Mitigation until the keys are persisted somewhere durable** (for example in Postgres or a file volume, which is a
`BuildingBlocks` change that needs approval):

- Back up the Redis volume (or at least the key ring) **alongside the nightly dump** and copy it off-site with
  the dump:

  ```bash
  cd /opt/pharmacy
  # Key ring only (small, enough to decrypt secrets). Lines are XML, one key per list entry.
  docker exec fsh-redis sh -c 'valkey-cli -a "$REDIS_PASSWORD" --no-auth-warning LRANGE DataProtection-Keys 0 -1' \
    > backups/dataprotection-keys-$(date -u +%Y%m%dT%H%M%SZ).txt
  # Or the whole volume (also keeps sessions): snapshot, then tar.
  docker exec fsh-redis sh -c 'valkey-cli -a "$REDIS_PASSWORD" --no-auth-warning BGSAVE'
  docker run --rm -v fsh_redis_data:/data:ro -v "$PWD/backups:/backup" alpine \
    tar czf /backup/redis-data-$(date -u +%Y%m%dT%H%M%SZ).tgz -C /data .
  ```
- Treat these files as secrets. Anyone holding them plus a dump can decrypt tenant credentials.

## Scenarios

### A. Bad deploy (app unhealthy or broken after a release)

1. `scripts/deploy.sh` already rolls back automatically when health checks fail, and the GitHub job fails. Check the
   job log for "rolled back to <sha>".
2. If the release came up "healthy" but is functionally broken, roll back by hand to the previous sha:
   ```bash
   cd /opt/pharmacy
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin   # a PAT with read:packages
   IMAGE_PREFIX=ghcr.io/<owner>/pharmacy IMAGE_TAG=<previous sha> sh scripts/deploy.sh
   ```
   You can also revert the commit on `main` and let CI deploy.
3. **Migrations are not rolled back.** EF migrations here are meant to be additive, so the previous release usually
   runs on the newer schema. If the migration itself damaged data or is incompatible, restore the
   pre-deploy dump (scenario B) using `backups/fsh-predeploy-<time>.dump` from just before that deploy. Every
   write since that dump is lost.

### B. Database corruption or data loss (host intact)

1. Stop writers: `docker compose stop api pharmacywebapp admin`.
2. Choose the dump: the newest good one in `/var/backups/pharmacy/` (nightly) or `/opt/pharmacy/backups/`
   (pre-deploy), or fetch it from off-site storage.
3. Optional (recommended when time allows): prove it restores with
   `BACKUP_DIR=<dir> sh scripts/restore-test.sh <file.dump>`. It restores into a scratch DB and compares row counts.
   Counts will differ from a corrupted live DB, which is expected.
4. Keep a copy of the current state before overwriting it: `sh scripts/backup.sh` with `BACKUP_TAG=prerestore`.
5. Restore:
   ```bash
   docker exec -i fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h localhost -U fsh -d fsh --clean --if-exists --no-owner --exit-on-error' < <file.dump>
   docker compose up -d
   ```
6. Run the verification checklist below. Tell tenants which period of data is lost (from the dump time until now).

### C. Host loss (VPS gone, disk dead, provider outage)

1. **Provision** a new VPS (2+ vCPU / 4 GB). Install Docker Engine + the Compose plugin, add the deploy user to the
   `docker` group, and open the firewall for 22/80/443 only.
2. **Restore config:** create `/opt/pharmacy`, then put the `.env` from the password manager in it. Use the same secrets,
   and in particular the same `JWT_SIGNING_KEY`, `POSTGRES_PASSWORD` and `REDIS_PASSWORD`.
3. **Get the compose bundle:** point the GitHub variable `VPS_HOST` at the new host (and update `VPS_SSH_KEY`
   if needed), or copy `deploy/docker/{docker-compose.yml,docker-compose.nginx-proxy.yml,Caddyfile,postgres-init,scripts}`
   to `/opt/pharmacy` from a checkout.
4. **Start the data plane only:**
   ```bash
   cd /opt/pharmacy
   docker compose up -d postgres rustfs s3-init
   ```
   If you have a Redis volume backup, restore it **before** Redis first starts:
   ```bash
   docker volume create fsh_redis_data
   docker run --rm -v fsh_redis_data:/data -v "$PWD/backups:/backup" alpine tar xzf /backup/redis-data-<time>.tgz -C /data
   ```
   If you only have the key-ring export, start Redis and `RPUSH DataProtection-Keys` each saved line back, in
   order, before the API starts. Then run `docker compose up -d redis`.
5. **Restore the DB:** download the latest off-site dump into `/opt/pharmacy/backups/`, then run the `pg_restore` command
   from scenario B (step 5, without `docker compose up -d` yet).
6. **Start the app at the last known-good release:** `docker login ghcr.io`, then
   `IMAGE_PREFIX=ghcr.io/<owner>/pharmacy IMAGE_TAG=<sha> sh scripts/deploy.sh`. Use the sha of the last
   successful deploy from the GitHub Actions history. The migrator re-applies any missing migrations, and seeding
   is idempotent.
7. **DNS:** point the app/admin/API records at the new IP. Caddy or acme-companion re-issues certificates.
8. **If Redis/Data Protection keys were NOT recovered:** every user signs in again (sessions are gone), and each
   tenant must **re-enter IRD CBMS, Fonepay, SMS provider and webhook secrets** in Settings. Pending
   password-reset links stop working. Until IRD credentials are re-entered, IRD queue items will fail and need resending.
9. **Uploaded files** (`fsh_s3_data`) are lost unless backed up separately. Records that reference them will
   show missing files.
10. Run the verification checklist. Put the nightly backup cron back:
    `15 2 * * * /opt/pharmacy/scripts/backup.sh >> /var/log/pharmacy-backup.log 2>&1`.

## Verification checklist (after any restore)

- [ ] `curl -fsS http://127.0.0.1:8080/health/live` and `curl -fsS http://127.0.0.1:8080/health/ready` both return OK
      (ready = DB, Redis and Hangfire reachable, all tenants migrated)
- [ ] `curl -fsSI http://127.0.0.1:3000/` answers (a redirect to sign-in is fine). The public HTTPS URL works
- [ ] Sign in to the pharmacy app as a tenant user, and to the admin console as root
- [ ] Latest records match expectations (newest sale/voucher timestamp is about the dump time)
- [ ] Make a **test sale** (cash) at a test tenant/branch. The voucher appears in Accounting after the next Outbox cycle.
      Cancel or void it afterwards
- [ ] **IRD queue health:** Reports → IRD (`GET /api/v1/sales/reports/ird-health`) shows no growing failed count
      for IRD-enabled tenants. Resend failed items once credentials are valid
- [ ] **SMS:** Settings → SMS status (`GET /api/v1/notifications/sms/status`) is healthy. Send a test SMS
      (`POST /api/v1/notifications/sms/test`)
- [ ] Hangfire dashboard (`<API URL>/jobs`): recurring jobs registered, no mass failures
- [ ] Fonepay QR: generate one test QR for a tenant that uses it
- [ ] Off-site backup ran after recovery (check `/var/log/pharmacy-backup.log` and the bucket)

## Routine checks (to keep the targets real)

- Nightly `backup.sh` cron on the server. Confirm the off-site copy appears in the bucket.
- Weekly `scripts/restore-test.sh` (set `BACKUP_DIR` if dumps are not in `/var/backups/pharmacy`).
- Run a host-loss drill (scenario C) on a throwaway VPS each quarter, and record the time it took against the 4 h RTO.

## Contacts

| Role | Name | Contact |
|---|---|---|
| Incident lead / on-call | _TBD_ | _phone / email_ |
| Backup owner (server, cron, off-site bucket) | _TBD_ | _…_ |
| VPS provider support | _provider_ | _support URL / account id_ |
| DNS / domain registrar | _provider_ | _…_ |
| Off-site storage provider | _provider_ | _…_ |
| GitHub org admin (Actions, GHCR, secrets) | _TBD_ | _…_ |
| Tenant communication (pharmacies) | _TBD_ | _…_ |

## Path to tighter targets

- **Lower the RPO from 24 h to minutes:** continuous WAL archiving with **pgBackRest** or **WAL-G** to object storage,
  giving point-in-time recovery. Or move to managed Postgres with PITR.
- **Encrypted off-site backups:** encrypt dumps (and the Redis/key-ring export) with **age** before upload. Keep the
  private key outside the server, and set bucket retention/object lock.
- **Scheduled restore test in CI:** a scheduled workflow pulls the latest off-site dump, restores it into a
  Postgres container, and runs `restore-test.sh`-style checks plus a smoke test of the API against it.
- **Back up `s3_data`:** sync the RustFS bucket off-site (`rclone sync` / `aws s3 sync`) nightly, or move file storage
  to a managed S3 with versioning.
- **Persist Data Protection keys durably** (Postgres via EF, or a backed-up file volume, with key encryption).
  This removes the KNOWN RISK above. It is a `src/BuildingBlocks` change and needs approval.
- **Lower the RTO:** keep a provisioned standby (or an infra-as-code script for the VPS) and a staging stack that
  doubles as a restore target.
