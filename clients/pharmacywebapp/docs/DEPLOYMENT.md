# Deploying the pharmacy web app

The web app is not deployed on its own. It ships as the `pharmacywebapp` service (container `pharmacy-web`)
of the single-host Docker Compose stack in **`deploy/docker/`**, alongside the .NET API, migrator,
Postgres, Redis (Valkey) and RustFS (S3). For full operator details (first install, proxies, troubleshooting),
see **[`deploy/docker/README.md`](../../../deploy/docker/README.md)**. For backups and recovery, see
**[`docs/runbooks/disaster-recovery.md`](../../../docs/runbooks/disaster-recovery.md)**.

## How a release reaches production

`.github/workflows/deploy.yml` runs on every push to `main` (and on `workflow_dispatch`). Pull requests only
build images, without pushing or deploying.

1. **Build** four images in parallel: `api`, `migrator`, `admin`, `web` (this app,
   `clients/pharmacywebapp/Dockerfile`, a Next.js standalone build running as the `node` user). They are pushed to GHCR as
   `ghcr.io/<owner>/pharmacy/<image>:<commit sha>` and `:latest`. `NEXT_PUBLIC_*` values come from repo
   **variables** and are baked in at build time.
2. **Storage smoke test.** The workflow boots the compose RustFS + bucket-init and round-trips an object.
3. **Deploy** (only when `VPS_HOST` is set, GitHub environment `production`):
   * SCP the compose bundle (`docker-compose.yml`, `docker-compose.nginx-proxy.yml`, `Caddyfile`,
     `postgres-init/`, `scripts/`) to `DEPLOY_PATH` (default `/opt/pharmacy`). The server never gets the
     source tree.
   * SSH in, `docker login ghcr.io`, then run **`scripts/deploy.sh`** with `IMAGE_PREFIX` / `IMAGE_TAG=<sha>`.

### What `deploy/docker/scripts/deploy.sh` does

1. Records the running release (`.deployed-tag`, falling back to the `fsh-api` container's image tag) as the rollback target.
2. Notes whether the API is currently ready. If it already isn't, only liveness is required afterwards.
3. `docker compose pull`. A failure stops the deploy before anything running is touched.
4. **Pre-deploy database dump** via `scripts/backup.sh` (`./backups/fsh-predeploy-<UTC>.dump`, newest
   `DEPLOY_BACKUP_KEEP`=5 kept, copied off-site if `OFFSITE_*` is set). A failed dump aborts the deploy.
5. `docker compose up -d` (the migrator runs first and applies EF migrations).
6. **Health polling** for up to `DEPLOY_HEALTH_TIMEOUT` (300 s): API `/health/ready` (or `/health/live`)
   and the web app's `/` (a redirect to sign-in counts as healthy).
7. Healthy: writes `.deployed-tag` and prunes dangling images. Unhealthy: **rolls back the images** to
   the previous sha, re-checks health, and fails the job either way.

> Rollback restores **images only**. Migrations already applied are not reverted. If the schema change itself
> is the problem, restore the pre-deploy dump (see the DR runbook).

Manual re-run on the server: `cd /opt/pharmacy && IMAGE_PREFIX=ghcr.io/<owner>/pharmacy IMAGE_TAG=<sha> sh scripts/deploy.sh`.

## Configuration the web app needs

### Build time (GitHub repo variables → Docker build args → `NEXT_PUBLIC_*`)

Changing any of these requires a rebuild.

| Repo variable | Build arg | Purpose |
|---|---|---|
| `PHARMACY_APP_URL` | `NEXT_PUBLIC_APP_URL` | Public URL of the app |
| `PHARMACY_TENANT_ROOT_DOMAIN` | `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | Optional per-tenant subdomains (`acme.app.example.com` → tenant `acme`) |
| `GOOGLE_CLIENT_ID` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional Google sign-in. It must also be in the API's `GoogleAuth:ClientIds` |
| `SUPPORT_EMAIL`, `SUPPORT_PHONE` | `NEXT_PUBLIC_SUPPORT_*` | Optional contact details on error screens |

### Runtime (set by `docker-compose.yml` from the server's `.env`)

| Variable | Value / source | Purpose |
|---|---|---|
| `DOTNET_API_URL` | `http://fsh-api:8080` (fixed) | Where the BFF proxy forwards. It is server-side only. |
| `REDIS_URL` | `redis://:${REDIS_PASSWORD}@fsh-redis:6379/1` | Session token store (logical DB 1). Sessions survive redeploys. **`REDIS_PASSWORD` must be URL-safe.** |
| `TRUSTED_PROXY_HOPS` | `.env`, default `1` | Number of proxies appending to `X-Forwarded-For`, so the real client IP reaches the API's rate limiter |
| `NEXT_PUBLIC_APP_URL`, `TENANT_ROOT_DOMAIN` | from `PHARMACY_APP_URL`, `PHARMACY_TENANT_ROOT_DOMAIN` | Same values at runtime for server code |
| `SENTRY_DSN` | `.env` `WEB_SENTRY_DSN`, empty = off | Optional server-side error reporting (Sentry-compatible) |
| `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | `production`, the image sha | Error-report tags |

The API side of the same `.env` must agree with the web app. `PHARMACY_APP_URL` is also the API's CORS origin and
`OriginOptions__OriginUrl`, so emailed confirm/reset links point at this app. The full list of server
variables (secrets, data-plane passwords, `DEPLOY_*`, `OFFSITE_*`) is in `deploy/docker/.env.example`.

The app listens on `127.0.0.1:${PHARMACY_APP_PORT:-3000}` only. Put a reverse proxy in front: the bundled
`caddy` profile, the nginx-proxy overlay, or `nginx.conf.example`.

> `clients/pharmacywebapp/.env.example` (local dev) still lists `ENCRYPTION_KEY`, `HASH_SALT` and
> `NEXT_PUBLIC_ONBOARDING_EMAIL`. The current code doesn't read them. For local dev you need
> `DOTNET_API_URL` (e.g. `http://localhost:5030`) and, optionally, `REDIS_URL`.

## One-time setup

* **Server:** Docker + Compose plugin. `/opt/pharmacy/.env` filled from `deploy/docker/.env.example`. The deploy
  user is in the `docker` group. The firewall allows only 22/80/443.
* **GitHub:** variables `VPS_HOST`, `VPS_USER`, optional `DEPLOY_PATH` and `IMAGE_PLATFORMS`, plus the build-time variables above. Secret
  `VPS_SSH_KEY`.
* **Cron** on the server: nightly `scripts/backup.sh`, and preferably a weekly `scripts/restore-test.sh`.

## Post-deploy smoke test

- [ ] `curl -fsS http://127.0.0.1:8080/health/ready` and `curl -fsSI http://127.0.0.1:3000/` succeed
- [ ] Sign in on the pharmacy host (and a tenant subdomain, if used). The session survives a container restart
- [ ] A POS sale (cash) completes and prints. The voucher appears in Accounting shortly after (Outbox)
- [ ] Purchases: receiving a PO updates stock and supplier AP
- [ ] Reports → VAT return loads for the current month
- [ ] IRD queue health shows no stuck/failed items (if IRD is enabled for the tenant)
