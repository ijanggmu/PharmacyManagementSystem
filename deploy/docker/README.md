# Deploy the Pharmacy Management System with Docker Compose

This brings up the full stack on a single host (a VPS with 2+ vCPU / 4 GB RAM is comfortable):

| Service | Image | Host port | What it is |
|---|---|---|---|
| `pharmacywebapp` | `pharmacy/web:local` | `PHARMACY_APP_PORT` (default 3000) | Pharmacy web app (Next.js BFF) — what pharmacy staff use |
| `api` | `fsh/api:local` | `FSH_API_PORT` (default 8080) | ASP.NET Core API |
| `admin` *(optional, `admin` profile)* | `fsh/admin:local` | `FSH_ADMIN_PORT` (default 8081) | Platform operator console (tenants, plans, audits) |
| `migrator` | `fsh/dbmigrator:local` | — | One-shot: applies EF migrations + seeds the root tenant + default admin |
| `postgres` / `redis` / `rustfs` | upstream images | (internal) | Data plane (RustFS = S3-compatible file storage) |
| `caddy` *(optional, `--profile caddy`)* | `caddy:2-alpine` | 80, 443 | TLS edge with automatic Let's Encrypt certificates |

The pharmacy web app calls the API server-side over the compose network (`DOTNET_API_URL=http://fsh-api:8080`), so pharmacy users never talk to the API directly. The API only needs a public URL for the admin console (which calls it from the browser) or other external clients. The admin console runs only when `COMPOSE_PROFILES` includes `admin`.

## Prerequisites

- Docker Engine 24+ with the Compose plugin (`docker compose version` prints v2.x).
- Three DNS records pointing at the server, e.g. `app.example.com`, `admin.example.com`, `api.example.com`.
- Firewall: allow 22, 80, 443 only. The service ports (3000/8080/8081) are published for a proxy and should not be open to the internet.

## Deploy

```bash
git clone git@github.com:ijanggmu/PharmacyManagementSystem.git
cd PharmacyManagementSystem/deploy/docker
cp .env.example .env
$EDITOR .env    # URLs + hosts, JWT_SIGNING_KEY, SEED_ADMIN_PASSWORD, HANGFIRE_*, data-plane passwords

docker compose --profile caddy up -d --build
docker compose logs -f migrator   # wait for it to exit 0
```

Generate secrets with `openssl rand -base64 48`. Leave out `--profile caddy` if you already have a reverse proxy (Dokploy/Coolify/Traefik/nginx/Cloudflare Tunnel); point it at the host ports above instead.

## Behind an existing nginx-proxy (jwilder/nginxproxy + acme-companion)

If the host already routes by `VIRTUAL_HOST` with `nginx-proxy`, don't add another proxy. Add the overlay in `.env`:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.nginx-proxy.yml
PROXY_NETWORK=<network nginx-proxy is on>   # docker inspect nginx-proxy --format '{{json .NetworkSettings.Networks}}'
PHARMACY_APP_HOST=app.example.com
FSH_API_HOST=api.example.com
LETSENCRYPT_EMAIL=you@example.com
```

The web app and API join that network with `VIRTUAL_HOST`/`LETSENCRYPT_HOST`; acme-companion issues their certificates once DNS points at the host. Per-host nginx settings go in nginx-proxy's `vhost.d/<hostname>` file (mounted into `/etc/nginx/vhost.d`), then `docker exec nginx-proxy nginx -s reload`:

```nginx
# vhost.d/app.example.com and vhost.d/api.example.com
client_max_body_size 20m;
proxy_read_timeout 1h;   # long-lived SSE / SignalR
```

## Deploy from GitHub Actions (recommended)

`.github/workflows/deploy.yml` builds the `api`, `migrator`, `admin` and `web` images on GitHub, pushes them to GHCR, copies this folder to the server and runs `docker compose pull && up -d`. The VPS never builds anything.

One-time server setup:

```bash
sudo mkdir -p /opt/pharmacy && sudo chown "$USER" /opt/pharmacy
# copy .env.example from the repo to /opt/pharmacy/.env and fill it in
sudo usermod -aG docker "$USER"            # the deploy user runs docker without sudo
```

One-time GitHub setup (Settings → Secrets and variables → Actions):

| Kind | Name | Value |
|---|---|---|
| Variable | `VPS_HOST` | server IP or hostname (the deploy job is skipped until this is set) |
| Variable | `VPS_USER` | SSH user on the server |
| Variable | `DEPLOY_PATH` | optional, default `/opt/pharmacy` |
| Variable | `IMAGE_PLATFORMS` | optional, default `linux/amd64`; `linux/arm64` for Oracle Ampere |
| Variable | `PHARMACY_APP_URL` (+ optional `PHARMACY_TENANT_ROOT_DOMAIN`, `GOOGLE_CLIENT_ID`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`) | baked into the web app at build time |
| Secret | `VPS_SSH_KEY` | private key for `VPS_USER` (generate a dedicated key: `ssh-keygen -t ed25519 -f deploy_key`) |

Then every push to `main` deploys; pull requests only build. Re-run a deploy from the Actions tab (`workflow_dispatch`).

## Verify

```bash
curl -fsS  http://localhost:8080/health/live   # API liveness
curl -fsSI http://localhost:3000/ | head -1    # pharmacy web app
curl -fsSI http://localhost:8081/ | head -1    # admin console
```

## Sign in for the first time

Open `https://admin.example.com` (or the pharmacy app) as `admin@root.com`, tenant `root`, password = `SEED_ADMIN_PASSWORD`. Rotate it immediately.

## Updating

```bash
git pull
docker compose --profile caddy up -d --build
```

The `migrator` re-runs and applies new migrations before `api` restarts. Pharmacy web sessions live in the app's memory, so users sign in again after the `pharmacywebapp` container is replaced. For the same reason, run exactly one `pharmacywebapp` replica.

`NEXT_PUBLIC_*` values (`PHARMACY_APP_URL`, `GOOGLE_CLIENT_ID`, `SUPPORT_*`, `PHARMACY_TENANT_ROOT_DOMAIN`) are baked in at build time — rebuild after changing them.

## Backing up

All state is in named volumes (`fsh_pg_data`, `fsh_redis_data`, `fsh_s3_data`). The database is the one that matters:

```bash
scripts/backup.sh         # dump to /var/backups/pharmacy, keep 14 days (BACKUP_DIR, KEEP_DAYS)
scripts/restore-test.sh   # restore the newest dump into a scratch DB and compare row counts
```

Schedule `backup.sh` nightly in cron, run `restore-test.sh` weekly, and copy `/var/backups/pharmacy` off the server (rclone to S3/Backblaze/Google Drive). `restore-test.sh` fails loudly if the dump can't be restored, which also catches data inconsistencies such as broken foreign keys.

## Swapping in managed services

1. Comment out the `postgres` / `redis` / `rustfs` / `s3-init` services and remove them from `depends_on:` of `api` and `migrator`.
2. Point `DatabaseOptions__ConnectionString`, `CachingOptions__Redis`, and `Storage__*` on `api` and `migrator` at the managed services.
3. `docker compose up -d`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `xxx is required` at `docker compose up` | A required env var is empty in `.env`; the error names it. |
| `SigningKey looks like a sample placeholder` | `JWT_SIGNING_KEY` contains `replace-with`. Generate a real key. |
| Admin console shows a CORS error | `FSH_ADMIN_URL` doesn't match the URL your proxy serves. |
| Pharmacy app loads but every call fails with 502 | `api` isn't healthy yet — `docker compose logs api`. |
| Caddy can't get a certificate | DNS for the host doesn't point at this server yet, or port 80 is blocked. |
| nginx-proxy returns 503 for the host | The container isn't on `PROXY_NETWORK`, or `VIRTUAL_HOST` doesn't match. `docker logs nginx-proxy`. |
| `migrator` retries Postgres then fails | Usually `POSTGRES_PASSWORD` changed against an existing volume. |
