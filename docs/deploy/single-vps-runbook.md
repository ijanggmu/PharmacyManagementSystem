# Pilot deploy runbook — one pharmacy on one VPS

**Audience:** a competent non-engineer. You need to be able to copy and paste into a terminal and read
error messages. You do **not** need to know .NET, Docker internals or SQL.

**What you are building:** the whole Pharmacy Management System on **one** server — database, cache, file
storage, API, the pharmacy web app, and HTTPS. One server per pharmacy group is the supported pilot shape
(see [ADR 0005](../adr/0005-single-vps-compose-deployment.md)).

**Time:** about 60–90 minutes the first time, most of it waiting for images to build.

**Related documents**

| Document | Use it for |
|---|---|
| [`docs/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) | The server died, the database is corrupt, a release is bad. Recovery scenarios A/B/C, RPO/RTO. |
| [`deploy/docker/README.md`](../../deploy/docker/README.md) | Engineer-level reference for the same stack: nginx-proxy overlay, managed Postgres/Redis, GitHub Actions deploy. |
| [Branch decision table](#branch-decision-table) | Which branch we ship and what happened to every other branch. |

> **Rule:** never type a real password, key or connection string into a chat message, a ticket, a commit or
> this file. This runbook only ever names secrets. Values live in the server's `.env` file and in the team
> password manager.

---

## 0. Before you start — what you need

| # | You need | How to check / get it |
|---|---|---|
| 0.1 | A Linux VPS, Ubuntu 24.04 LTS, **2 vCPU / 4 GB RAM / 40 GB disk** minimum | Any provider. 4 GB is the floor: the first image build needs it. |
| 0.2 | `root` or a `sudo` user, over SSH | `ssh <user>@<server-ip>` must get you a prompt. |
| 0.3 | A domain name you control | You will point two names at the server. |
| 0.4 | Two DNS **A records** pointing at the server's IP: `app.<your-domain>` and `api.<your-domain>` | Step 3 checks them. Add `admin.<your-domain>` only if you want the operator console. |
| 0.5 | A password manager the pharmacy's owner and GrowthForge can both reach | Six secrets get generated in step 4 and must be stored. **If they are lost, backups cannot be restored.** |

Throughout, replace:

- `<your-domain>` → the real domain, e.g. `sunrisepharmacy.com.np`
- `<server-ip>` → the server's IPv4 address
- `<deploy-user>` → the Linux user you created in step 1

---

## 1. Prepare the server

Log in over SSH first: `ssh root@<server-ip>`.

**1.1 — Create a non-root user to run the stack.**

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

Expected: no output from any line. Then check you can log in as that user from your own machine:

```bash
ssh deploy@<server-ip> 'whoami'
```

Expected output:

```
deploy
```

**From here on, every command runs as `deploy`.**

**1.2 — Install Docker Engine and the Compose plugin.**

```bash
sudo apt-get update
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Log out and back in (`exit`, then `ssh deploy@<server-ip>`) so the group takes effect, then:

```bash
docker compose version
```

Expected output (version numbers will differ, the `v2.` matters):

```
Docker Compose version v2.39.4
```

If you get `permission denied while trying to connect to the Docker daemon`, you did not log out and back in.

**1.3 — Close everything except SSH and the web.**

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

Expected output:

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
...
```

> The app's internal ports (3000, 8080, 8081) are published on `127.0.0.1` only by design, so they are not
> reachable from the internet even though Docker bypasses `ufw`. Do not change that.

**1.4 — Create the deploy directory.**

```bash
sudo install -d -o deploy -g deploy /opt/pharmacy
```

Expected: no output.

---

## 2. Get the code onto the server

```bash
cd /opt
sudo git clone https://github.com/ijanggmu/PharmacyManagementSystem.git pms
sudo chown -R deploy:deploy /opt/pms
cd /opt/pms
git checkout release/pilot-1
git log --oneline -1
```

Expected output: one line showing the release commit, for example

```
12eb94ea Tenant onboarding, user admin, expiry area, Money/tabs redesign
```

The branch you deploy is **`release/pilot-1`** — see the [branch decision table](#branch-decision-table).
Never deploy `main` directly and never deploy a `feat/…`, `fix/…` or `worktree-agent-…` branch.

Copy the deploy bundle into its own directory, so a `git pull` can never overwrite the server's secrets:

```bash
cp -r /opt/pms/deploy/docker/. /opt/pharmacy/
ls /opt/pharmacy
```

Expected output:

```
Caddyfile  docker-compose.nginx-proxy.yml  docker-compose.yml  nginx.conf.example
postgres-init  README.md  scripts  .env.example
```

---

## 3. Check DNS before you ask for certificates

```bash
dig +short app.<your-domain>
dig +short api.<your-domain>
```

Expected output: **your server's IP, twice.** For example:

```
203.0.113.42
```

If either comes back empty or with a different address, stop and fix DNS first. Let's Encrypt will refuse
to issue a certificate and step 7 will loop.

---

## 4. Fill in the configuration file

**4.1 — Generate the six secrets.** Run this once and keep the terminal open:

```bash
cd /opt/pharmacy
for name in JWT_SIGNING_KEY SEED_ADMIN_PASSWORD HANGFIRE_PASSWORD; do
  printf '%s=%s\n' "$name" "$(openssl rand -base64 36 | tr -d '/+=' | cut -c1-40)"
done
for name in POSTGRES_PASSWORD REDIS_PASSWORD S3_SECRET_KEY; do
  printf '%s=%s\n' "$name" "$(openssl rand -hex 24)"
done
```

Expected output: six `NAME=value` lines. **Copy all six into the password manager now**, under an entry
named `Pharmacy <pharmacy name> — server secrets`.

> `REDIS_PASSWORD` must stay letters-and-digits only — it is embedded in a URL. `openssl rand -hex` above
> guarantees that. Do not hand-edit it into something with `/`, `+` or `@`.
> `JWT_SIGNING_KEY` must be 32+ characters and must not contain the text `replace-with`; the API refuses to
> start otherwise.

**4.2 — Create `.env` from the template and edit it.**

```bash
cd /opt/pharmacy
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in exactly these keys. Every other line in the template can stay as it is.

| Key | What to put |
|---|---|
| `PHARMACY_APP_URL` | `https://app.<your-domain>` |
| `FSH_API_URL` | `https://api.<your-domain>` |
| `FSH_ADMIN_URL` | `https://admin.<your-domain>` (or the same as `PHARMACY_APP_URL` if you skip the console) |
| `PHARMACY_APP_HOST` | `app.<your-domain>` |
| `FSH_API_HOST` | `api.<your-domain>` |
| `FSH_ADMIN_HOST` | `admin.<your-domain>` |
| `JWT_SIGNING_KEY` | from 4.1 |
| `SEED_ADMIN_PASSWORD` | from 4.1 |
| `HANGFIRE_USERNAME` | `pharmacyops` (any name, 3+ characters) |
| `HANGFIRE_PASSWORD` | from 4.1 (12+ characters) |
| `POSTGRES_PASSWORD` | from 4.1 |
| `REDIS_PASSWORD` | from 4.1 |
| `S3_ACCESS_KEY` | `pharmacyfiles` (any name) |
| `S3_SECRET_KEY` | from 4.1 |
| `COMPOSE_PROFILES` | `caddy` — uncomment this line. Add `admin,caddy` if you want the operator console. |

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

**4.3 — Check nothing required is still blank.**

```bash
cd /opt/pharmacy
docker compose config --quiet && echo "CONFIG OK"
```

Expected output:

```
CONFIG OK
```

If instead you see something like `error while interpolating services.api.environment.[]:
required variable HANGFIRE_PASSWORD is missing a value`, that key is still empty in `.env`. Fix it and
run the check again.

---

## 5. Build the images

This is the long step. On a 2 vCPU server expect **20–40 minutes**.

```bash
cd /opt/pharmacy
docker compose build 2>&1 | tail -20
```

Expected final lines:

```
 => => naming to docker.io/fsh/api:local
 => => naming to docker.io/fsh/migrator:local
 => => naming to docker.io/fsh/web:local
```

Then confirm:

```bash
docker images | grep -E 'fsh/(api|migrator|web)'
```

Expected output: three lines, one per image.

If the build is killed with `signal: killed` or `out of memory`, the server is too small. Add swap and retry:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 6. Database: start it, migrate it, seed it

The database is **never** migrated by the API at startup. Migration is always its own step, run by the
`migrator` container. This is deliberate — see
[`src/Host/FSH.Starter.DbMigrator/README.md`](../../src/Host/FSH.Starter.DbMigrator/README.md).

**6.1 — Start the data plane only (database, cache, file storage).**

```bash
cd /opt/pharmacy
docker compose up -d postgres redis rustfs s3-init
docker compose ps
```

Expected output: `fsh-postgres`, `fsh-redis` and `fsh-rustfs` with `STATUS` showing `Up … (healthy)`, and
`fsh-s3-init` showing `Exited (0)`. Healthy can take up to 60 seconds; re-run `docker compose ps` if a
container still says `(health: starting)`.

**6.2 — See what the migrator is about to do (optional, read-only).**

```bash
docker compose run --rm migrator list-pending
```

Expected output: a list of pending migrations per module, ending in exit code 0. Nothing is changed.

**6.3 — Apply the schema and seed the platform rows.**

```bash
docker compose run --rm migrator
```

(The image's own command is `apply --seed`, so no arguments are needed.)

Expected output ends with lines like:

```
[INF] applying migrations for tenant 'root'
[INF] seeding tenant 'root'
[INF] migrator finished successfully
```

and the command exits `0`. Check it did:

```bash
echo "exit code: $?"
```

Expected output:

```
exit code: 0
```

If the migrator exits `1`, read the logged exception. The most common cause is that `POSTGRES_PASSWORD` in
`.env` was changed after the database volume was already created — the password is baked into the volume on
first start. Either put the original password back, or destroy the empty volume and start over
(`docker compose down && docker volume rm fsh_pg_data` — **only safe before there is real data**).

**6.4 — Confirm the schema is really there.**

```bash
docker exec fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U fsh -d fsh -Atc "select count(*) from information_schema.tables where table_type=''BASE TABLE'' and table_schema not in (''pg_catalog'',''information_schema'')"'
```

Expected output: **137** on this release, with only the `root` tenant seeded (measured 2026-11-26 against
`release/pilot-1`). The number grows when modules are added, so treat anything in the low hundreds as
normal. A `0` means the migrator did not run.

---

## 7. Start the app and turn on HTTPS

```bash
cd /opt/pharmacy
docker compose up -d
docker compose ps
```

Expected output: `fsh-api`, `pharmacy-web` and `pharmacy-caddy` all `Up`. The first start of the API takes
30–60 seconds.

Caddy requests Let's Encrypt certificates for the hostnames in `.env` automatically. Watch it once:

```bash
docker compose logs caddy | grep -i 'certificate obtained'
```

Expected output: one `certificate obtained successfully` line per hostname. If you see
`could not get certificate from issuer`, DNS is wrong (go back to step 3) or port 80 is blocked (step 1.3).

---

## 8. Health check — is it actually working?

Run all four. **All four must pass before you let anyone sign in.**

```bash
curl -fsS  http://127.0.0.1:8080/health/live  && echo " <- API process alive"
curl -fsS  http://127.0.0.1:8080/health/ready && echo " <- API can reach DB, cache, jobs; all tenants migrated"
curl -fsSI http://127.0.0.1:3000/ | head -1
curl -fsSI https://app.<your-domain>/ | head -1
```

Expected output:

```
Healthy <- API process alive
Healthy <- API can reach DB, cache, jobs; all tenants migrated
HTTP/1.1 200 OK
HTTP/2 200
```

A `307` or `302` on either of the last two is also fine — that is the redirect to the sign-in page.

What a failure means:

| Symptom | Meaning | Do this |
|---|---|---|
| `/health/live` fails | The API container is not running | `docker compose logs --tail 80 api` |
| `/health/live` OK, `/health/ready` returns 503 | DB, cache or migrations | The 503 body lists what is unhealthy. A pending-migrations list means step 6.3 did not finish — re-run it. |
| Port 3000 fails | The web app container | `docker compose logs --tail 80 pharmacywebapp` |
| The public HTTPS URL fails but 3000 works | Caddy or DNS or the firewall | `docker compose logs --tail 80 caddy` |

---

## 9. Create the first admin and the pharmacy

Two different accounts exist. Do not mix them up.

**9.1 — The platform admin (already created for you in step 6.3).**

- Tenant: `root`
- Email: `admin@root.com`
- Password: the `SEED_ADMIN_PASSWORD` from step 4.1

This account administers the *platform*, not the pharmacy. Sign in once at `https://app.<your-domain>`
(tenant `root`) and **change the password immediately**. Keep it in the password manager — it is the account
that can create more pharmacies.

**9.2 — The pharmacy tenant and its owner.**

Pick an identifier (lowercase letters and digits, no spaces — it becomes part of URLs), a display name, and
the owner's real email. Choose a strong password for them and pass it in the environment so it is never
written to a file:

```bash
cd /opt/pharmacy
docker compose run --rm \
  -e SeedPharmacy__Id=sunrise \
  -e SeedPharmacy__Name='Sunrise Pharmacy' \
  -e SeedPharmacy__AdminEmail=owner@sunrisepharmacy.com.np \
  -e SeedPharmacy__AdminPassword='<the-owner-password-you-chose>' \
  migrator seed-pharmacy
```

Expected output ends with a line naming the created tenant and the owner user, exit code 0. The command is
idempotent: run it twice and the second run does nothing. It creates **the tenant and one owner user only** —
no medicines, no customers, no stock. That is what step 10 is for.

Give the owner their password through a channel the pharmacy already uses, and tell them to change it on
first sign-in. Record *that it was handed over*, never the value.

**9.3 — Confirm the tenant exists.**

```bash
curl -fsS http://127.0.0.1:8080/health/ready && echo " <- still healthy with the new tenant"
```

Expected output: `Healthy <- still healthy with the new tenant`. (`/health/ready` fails if any tenant is
unmigrated, so this also proves the new tenant's schema was created.)

---

## 10. Day one: load the pharmacy's data from their spreadsheet

This is the step the pharmacy actually cares about, and it is done in the browser, not on the server.

1. Sign in at `https://app.<your-domain>` as the owner (tenant identifier from 9.2).
2. Go to **Settings → Go-live setup** (`/dashboard/settings/go-live`).
3. Upload the pharmacy's existing stock spreadsheet. The page reads messy real-world workbooks — multiple
   sheets, merged headers, Nepali column names, dates in BS or AD — and shows you what it understood before
   anything is written.
4. Fix whatever it flags, then commit the import.
5. Check the result: **Inventory → Medicines** shows the medicines with batches and expiry dates, and
   **Reports → Stock** totals match the spreadsheet.

If the import is rejected or silently drops rows, **stop and raise it** — the go-live import is the sales
demo path and a regression there is treated as a revenue defect, not a cosmetic bug.

---

## 11. Where the logs are

There are no log files to hunt for. Everything goes to the container log.

| What | Command |
|---|---|
| API (requests, errors, IRD sync, background jobs) | `docker compose logs -f api` |
| Pharmacy web app | `docker compose logs -f pharmacywebapp` |
| Database | `docker compose logs -f postgres` |
| HTTPS / certificates | `docker compose logs -f caddy` |
| The migration step | `docker compose logs migrator` |
| Last 200 lines of everything, newest last | `docker compose logs --tail 200` |
| Background jobs dashboard | `https://api.<your-domain>/jobs` — sign in with `HANGFIRE_USERNAME` / `HANGFIRE_PASSWORD` |
| Nightly backup log (after step 12) | `cat /var/log/pharmacy-backup.log` |

Logs are kept by Docker and rotate with the daemon's defaults. To ship them somewhere searchable, set
`OTEL_EXPORTER_OTLP_ENDPOINT` in `.env` (the file documents the Seq settings) and `docker compose up -d api`.

---

## 12. Nightly backups

**12.1 — Take one now, by hand, and confirm it landed.**

```bash
sudo install -d -o deploy -g deploy /var/backups/pharmacy
cd /opt/pharmacy
sh scripts/backup.sh
```

Expected output, one line:

```
2026-11-26T04:12:33Z backup ok: /var/backups/pharmacy/fsh-20261126T041230Z.dump (1.4M)
```

**12.2 — Schedule it for 02:15 every night.**

```bash
( crontab -l 2>/dev/null; echo '15 2 * * * /opt/pharmacy/scripts/backup.sh >> /var/log/pharmacy-backup.log 2>&1' ) | crontab -
sudo touch /var/log/pharmacy-backup.log && sudo chown deploy /var/log/pharmacy-backup.log
crontab -l
```

Expected output: the cron line you just added.

**12.3 — Get the dumps off the server. This is not optional.**

A dump on the same disk as the database is not a backup — one dead disk loses both. Add **one** off-site
target to `.env` (names only; the file documents both options):

- `OFFSITE_S3_BUCKET` + `OFFSITE_S3_ACCESS_KEY` + `OFFSITE_S3_SECRET_KEY` (+ `OFFSITE_S3_ENDPOINT` for
  anything that is not AWS), or
- `OFFSITE_RCLONE_REMOTE` with `rclone` configured on the host.

Then re-run `sh scripts/backup.sh` and expect an extra line:

```
2026-11-26T04:20:01Z off-site copy ok: s3://<bucket>/pharmacy/db/fsh-20261126T042000Z.dump
```

Use a key that can only **write** to that bucket, and turn on the bucket's own versioning and retention.
Dumps are **not encrypted** — treat the bucket as holding patient and financial data.

> **Also back up `.env` itself**, into the password manager. It is not in any dump, and without
> `POSTGRES_PASSWORD` and `JWT_SIGNING_KEY` a restored database is useless. The Redis volume holds the
> encryption key ring for every tenant's IRD / Fonepay / SMS credentials and is **not** backed up by
> default — read the KNOWN RISK section of
> [`docs/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) before go-live.

---

## 13. Prove the restore

**A backup nobody has restored does not exist.** Do 13.1 on the day you install, and once a week after that.

**13.1 — Non-destructive proof (safe on a live system).**

```bash
cd /opt/pharmacy
sh scripts/restore-test.sh
```

What it does: restores the newest dump into a throwaway database `fsh_restore_test` inside the same
Postgres container, counts every row of every table in both the live and the restored database, compares
them, then drops the throwaway database. The live database is never touched.

Expected output:

```
restoring /var/backups/pharmacy/fsh-20261126T041230Z.dump into scratch database "fsh_restore_test"
restore OK: 137 tables, 3395 rows, counts match the live database
```

(137 tables / 3395 rows is a freshly seeded single-tenant database — the numbers measured in the drill
below. A live pharmacy will show more rows and, with more tenants, more tables. What matters is the words
`counts match`.)

Failure modes and what they mean:

| Output | Meaning |
|---|---|
| `restore OK: … counts match` | The dump is good. Done. |
| `restore finished but row counts differ`, listing tables | Expected **only** if the pharmacy was selling between the dump and the test. Re-run right after a fresh `backup.sh`; if it still differs, the dump is suspect — escalate. |
| `pg_restore: error: …` | The dump is **not restorable**. Treat as an incident: you have no working backup. Take a fresh one and investigate. |

**13.2 — The real thing (do this once, before go-live, while the database is still empty of real data).**

This deliberately destroys and rebuilds the database so that you have personally seen a restore work.
**Never run 13.2 once the pharmacy has real sales in it** — use the procedure in
[`docs/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) scenario B instead, which keeps a
`prerestore` dump first.

```bash
cd /opt/pharmacy

# 1. A dump to restore from, and a note of what is in it.
sh scripts/backup.sh
DUMP=$(ls -1t /var/backups/pharmacy/fsh-*.dump | head -1); echo "$DUMP"
docker exec fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U fsh -d fsh -Atc "select count(*) from information_schema.tables where table_schema not in (''pg_catalog'',''information_schema'')"'

# 2. Stop everything that writes.
docker compose stop api pharmacywebapp

# 3. Destroy the database.
docker exec fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U fsh -d postgres -c "DROP DATABASE fsh"'
docker exec fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U fsh -d postgres -c "CREATE DATABASE fsh"'

# 4. Restore it.
docker exec -i fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U fsh -d fsh --no-owner --exit-on-error' < "$DUMP"

# 5. Same table count as step 1?
docker exec fsh-postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U fsh -d fsh -Atc "select count(*) from information_schema.tables where table_schema not in (''pg_catalog'',''information_schema'')"'

# 6. Bring the app back and re-run the health check from step 8.
docker compose up -d
curl -fsS http://127.0.0.1:8080/health/ready && echo " <- restored database is serving"
```

Expected: the counts in steps 1 and 5 are **identical**, `pg_restore` prints nothing (that is success), and
`/health/ready` answers `Healthy`. Then sign in as the pharmacy owner and confirm their data is there.

Write the date you did this, and the row/table counts, in the pharmacy's handover note.

---

## 14. Deploy an update

```bash
cd /opt/pms
git fetch origin
git checkout release/pilot-1
git pull --ff-only
git log --oneline -1          # note this sha — it is what you roll back to

cd /opt/pharmacy
sh scripts/backup.sh          # never update without a fresh dump
cp -r /opt/pms/deploy/docker/docker-compose.yml /opt/pms/deploy/docker/Caddyfile /opt/pms/deploy/docker/scripts /opt/pharmacy/
docker compose build
docker compose up -d
```

Then re-run the **step 8 health check**. The `migrator` container runs again automatically and applies any
new migrations before the API restarts.

Expected: all four checks pass. If `/health/ready` returns 503 with a pending-migrations list, run
`docker compose run --rm migrator` by hand and check again.

> `.env` is never overwritten by an update — it lives in `/opt/pharmacy`, the code lives in `/opt/pms`.
> Values starting `NEXT_PUBLIC_` (the app URL, support phone, Google client id) are compiled into the web
> app, so changing them needs `docker compose build pharmacywebapp` and not just a restart.

---

## 15. Roll back

**15.1 — The app is broken, the database is fine (the usual case).**

```bash
cd /opt/pms
git checkout <the sha you noted in step 14>
cd /opt/pharmacy
cp -r /opt/pms/deploy/docker/docker-compose.yml /opt/pms/deploy/docker/Caddyfile /opt/pharmacy/
docker compose build && docker compose up -d
curl -fsS http://127.0.0.1:8080/health/ready && echo " <- rolled back and healthy"
```

Database migrations are **not** undone. They are written to be additive, so the previous release normally
runs fine on the newer schema.

**15.2 — The update damaged data.** Then it is a restore, not a rollback: follow scenario B in
[`docs/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md), using the dump you took in step 14.
Everything the pharmacy entered after that dump is lost, so tell them the exact window.

**15.3 — The server is gone.** Scenario C in the same document. You will need `.env` from the password
manager and the newest off-site dump.

---

## 16. Hand-over checklist

Do not call a pharmacy live until every line is ticked.

- [ ] All four step 8 health checks pass over the public HTTPS URL
- [ ] Platform admin password changed from the seeded value, stored in the password manager
- [ ] Pharmacy owner can sign in and has changed their password
- [ ] `.env` and all six secrets are in the password manager
- [ ] Go-live import run, stock totals reconciled with the pharmacy's spreadsheet (step 10)
- [ ] One test sale made, then cancelled; it appears in Accounting
- [ ] Nightly backup cron installed, one dump present, one off-site copy confirmed (step 12)
- [ ] `restore-test.sh` passed, and the destructive drill of step 13.2 was done and recorded
- [ ] Owner knows who to call, and GrowthForge knows which release sha is live

---

## Branch decision table

Reconciled on **2026-11-26** against `origin/main` at `12eb94ea`.

**Headline:** the repository was *not* 20 branches of divergent work. `origin/main` had already absorbed
every branch except four, and `origin/main` was identical to the checked-out `feat/tenant-create-user-admin`.
So the release line is `main` as it stood, named and frozen — not a merge exercise.

**The release line: `release/pilot-1`**, branched from `origin/main` at `12eb94ea`.

Contents: everything on `main` — all 19 modules, IRD CBMS e-billing, Nepali SMS providers, the Excel go-live
import, accounting/VAT, payroll, appointments, the role-permission fixes merged in PRs #58–#60, and the
tenant-onboarding / user-admin work — plus two housekeeping commits added here (ignore agent-harness files;
commit the `next dev`-generated `clients/pharmacywebapp/AGENTS.md`) and this runbook.

Left out: the four branches marked **keep** or **defer** below. Nothing was deleted and nothing was
force-pushed.

### Branches with unique, unlanded commits

| Branch | State vs `main` | Decision | Why |
|---|---|---|---|
| `fix/database-integrity` | ahead 13, behind 341 | **Keep — re-land deliberately, not into pilot-1** | Genuinely unlanded: 21 source/test files and 14 EF migrations absent from `main`, including money-path code (`Sales/Services/MoneyBackRules.cs`, `Inventory/Services/BatchSellingPrices.cs`, `Customers/Services/CustomerSaleAccount.cs`, `Prescriptions/…/PrescriptionDispenseEntry.cs`, row-lock helpers, `ActivateScheduledPricesJob`). Dated 2026-10-12 and 341 commits behind: a blind merge would conflict across 267 files and touch pricing and refunds. Needs a scoped re-land with a QA verdict. Follow-up issue created. |
| `fix/npm-vulnerabilities` | ahead 1, behind 40 | **Abandon — already on `main`** | Its only commit portals the dropdown submenu. `main`'s `clients/pharmacywebapp/components/ui/dropdown-menu.tsx` already contains that exact change (same code, same comment) under a different commit, so `git cherry` sees a different patch id but the content is live. Nothing to recover. |
| `fix/postgres18-volume` | ahead 1, behind 358 | **Abandon — already on `main`** | `git cherry` reports its commit as upstream-equivalent; the OTLP keys it adds to `deploy/docker/` are present on `main` via `feat/seq-logging`. |
| `dependabot/github_actions/github-actions-3979370d4d` | ahead 1, behind 21 | **Defer to Dependabot** | GitHub Actions version bumps in `.github/workflows/`. No runtime effect on a deployed pharmacy, so not pilot-blocking. Let its own PR land on `main` normally; do not carry it into the release line. |

### Local-only branch (never pushed)

| Branch | State | Decision | Why |
|---|---|---|---|
| `e2e/live-run-drift` | ahead 1, behind 1 — **local only** | **Keep, and push to `origin` so it stops being one machine's private work** | A single test-only commit realigning e2e-live flows 15/17/22/24 with the current app. No product code. Not merged into `pilot-1` because it is unreviewed and e2e-only. |

### Fully contained in `origin/main` — abandon the branch, the work is shipped

All of the following have **zero** commits `main` does not have. They are finished, merged work; the refs are
inventory, not progress, and can be deleted from `origin` and locally at any time.

`chore/monorepo-restructure` · `dev` · `feat/appointments-booking` · `feat/appointments-doctors` ·
`feat/consignment-stock-import` · `feat/erp-batch-4` · `feat/erp-batch-5` · `feat/erp-batch-6` ·
`feat/erp-batch-7` · `feat/go-live-setup` · `feat/go-live-ux` · `feat/goods-received-filters` ·
`feat/loyalty-points` · `feat/medicine-receipt-pricing` · `feat/po-receipt-grn` ·
`feat/price-currency-per-field` · `feat/reports-ui-enhancements` · `feat/returns-sales-ux` ·
`feat/seed-medicine-directory` · `feat/seq-logging` · `feat/tenant-create-user-admin` ·
`feature/dotnet-frontend` · `fix/accounting-batch-1` · `fix/accounting-batch-2-3` ·
`fix/accounting-dates-vat` · `fix/batch-2-access-and-cash` · `fix/customers-prescriptions` ·
`fix/db-integrity-port` · `fix/debit-note-integration-test` · `fix/inventory-integrity` ·
`fix/language-submenu` · `fix/owner-audit-log-access` · `fix/purchasing-suppliers` ·
`fix/qa-integration` · `fix/qa-phase-1-major` · `fix/race-tests-branch` · `fix/returns-suppliers-ui` ·
`fix/role-check-findings` · `fix/sales-lifecycle` · `fix/sales-returns-pricing` ·
`fix/security-hardening` · `fix/vouchers-returns-medicine-locks` · `fix/web-crosscutting` ·
`fix2/accounting` · `fix2/customers-rx` · `fix2/inventory` · `fix2/purchasing` · `fix2/qa-integration` ·
`fix2/sales` · `fix2/security` · `qa/live-full-run-20261124` ·
`dependabot/github_actions/github-actions-e40781d787` · `v0/ijanggmu-144babe1` ·
and the 30 `worktree-agent-a…` scratch branches.

**Recommended clean-up (needs CEO sign-off because it rewrites the remote's branch list, and should be one
batch, not drive-by):** delete the contained branches from `origin`, keep `main`, `release/pilot-1`,
`fix/database-integrity`, `e2e/live-run-drift` and the live Dependabot branch. Eight stale local
`git worktree` checkouts (`C:/pms-port`, `C:/Users/sthae/wt/*`, …) still pin some of these refs; prune those
first.

### Working-tree changes that were hanging around

| Path | Decision |
|---|---|
| `clients/pharmacywebapp/AGENTS.md` | **Committed** to `release/pilot-1`. It is generated by `next dev` and re-created on every run; its own text says to commit it. No secrets. |
| `.claude/skills/**`, `skills-lock.json` | **Ignored** via `.gitignore` on `release/pilot-1`. Agent-harness state installed into the checkout at runtime — tool state, not product code. |

---

## How much of this runbook was actually executed, and where

Honesty matters more here than a clean-looking document.

**Executed for real**, on 2026-11-26, against the `release/pilot-1` code in a scratch checkout on the
development machine (Windows), using a dedicated throwaway PostgreSQL 17.6 cluster on port 55432 created
solely for this drill — the machine's own PostgreSQL on 5432 was never touched:

- **Step 6.3 / 6.4 — migrate and seed.** `FSH.Starter.DbMigrator apply --seed` against an empty database
  with `DOTNET_ENVIRONMENT=Production`. Exit code 0, ending
  `[Inventory] seeded 2460 Nepal medicine catalog entries` / `[migrator] finished successfully.`
  Result: **137 tables, 3395 rows**, one tenant (`root`), one user (`admin@root.com`).
- **Step 12.1 — backup.** `pg_dump -Fc --no-owner` — the exact command `scripts/backup.sh` issues inside
  the container. Exit 0, 0.42 MB dump.
- **Step 13.1 — non-destructive restore proof.** The `restore-test.sh` procedure reproduced step for step:
  scratch database created, dump restored with `pg_restore --exit-on-error` (exit 0), per-table row counts
  compared between live and restored using the script's own SQL, scratch database dropped.
  Result: `restore OK: 137 tables, 3395 rows, counts match the live database`.
- **Step 13.2 — destructive restore.** `DROP DATABASE fsh WITH (FORCE)`, `CREATE DATABASE fsh`
  (table count verified back to **0**), then `pg_restore --exit-on-error` (exit 0). After the restore:
  **137 tables, 3395 rows — byte-identical per-table counts to before the drop** — and the canaries were
  back: `identity."Users"` → `admin@root.com`, `tenant."Tenants"` → `root`.
- **Update path, partially.** `apply --seed` re-run against the restored database to confirm the migration
  step is idempotent, which is what step 14 relies on.

**Not executed here**, because Docker Engine cannot start on this machine (Docker Desktop needs a Windows
service that only an administrator can start, and this session is not administrator):

- Steps 1–5, 7, 8, 9, 10, 11, 14, 15 — anything that needs `docker compose`, a real VPS, public DNS or
  Let's Encrypt. The commands are taken from the committed `deploy/docker/` compose file, `Caddyfile` and
  scripts, and from `.github/workflows/deploy.yml`, which CI exercises — but **nobody has walked them end to
  end on a clean server yet.**

**Next action:** walk steps 1–11 once on a throwaway VPS, from a blank Ubuntu image, with a stopwatch, and
correct this document where reality disagrees. That needs a server, which costs money, so it is the owner's
call — raised with the CEO. Until that is done, treat sections 1–11 as *reviewed and sourced*, not *proven*.
