#!/usr/bin/env sh
# Production rollout for the compose stack, run ON THE SERVER by the deploy workflow (over SSH, from
# $DEPLOY_PATH, after `docker login ghcr.io`). It can also be run by hand:
#   cd /opt/pharmacy && IMAGE_PREFIX=ghcr.io/<owner>/pharmacy IMAGE_TAG=<commit sha> sh scripts/deploy.sh
#
# What it does, in order — every step is safe to repeat:
#   1. Remember the release that is running now (its image sha), so there is something to roll back to.
#   2. Note whether the API is currently READY (so a check that was already failing before this deploy
#      does not get blamed on — and roll back — the new release).
#   3. Pull the new images. A failure here stops the deploy before anything running is touched.
#   4. Back up the database (scripts/backup.sh, label "predeploy", newest N kept). A failed backup stops the
#      deploy, again before anything is touched: migrations are never applied without a fresh dump.
#   5. `docker compose up` the new release (the migrator runs first, as before).
#   6. Poll the API health endpoint and the web app until both answer, or the timeout runs out.
#   7. Healthy → record the release in .deployed-tag and prune dangling images.
#      Not healthy (or step 5 failed) → roll back: `up` the previous sha-tagged images, check them the same
#      way, and FAIL the job either way so the broken release is visible in GitHub.
#
# Rollback restores the previous IMAGES only. Database migrations the new release applied are NOT undone
# (EF migrations here are additive, which the previous release tolerates); if the schema change itself is
# the problem, restore the pre-deploy dump by hand: see deploy/docker/README.md ("Restoring a dump").
#
# Settings — environment variables, or the same keys in the server's .env (environment wins):
#   IMAGE_PREFIX, IMAGE_TAG     required; the release to deploy (set by the workflow)
#   DEPLOY_HEALTH_TIMEOUT       seconds to wait for health after `up` (default 300)
#   DEPLOY_BACKUP               set to 0 to skip the pre-deploy backup (default 1; not recommended)
#   DEPLOY_BACKUP_DIR           where pre-deploy dumps go (default ./backups next to the compose file —
#                               the deploy user owns it, unlike /var/backups)
#   DEPLOY_BACKUP_KEEP          how many pre-deploy dumps to keep (default 5)
#   OFFSITE_*                   passed through to backup.sh (optional off-site copy; see backup.sh)
set -eu

deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$deploy_dir"

# shellcheck source=env-file.sh
. "$deploy_dir/scripts/env-file.sh"
test -f .env || { echo "missing $deploy_dir/.env (copy .env.example from the repo)" >&2; exit 1; }
load_env_keys .env 'DEPLOY_HEALTH_TIMEOUT|DEPLOY_BACKUP|DEPLOY_BACKUP_DIR|DEPLOY_BACKUP_KEEP'

: "${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
export IMAGE_PREFIX IMAGE_TAG
NEW_TAG=$IMAGE_TAG
HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-300}
STATE_FILE=.deployed-tag

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# A release tag we can roll back to: a git commit sha (7-40 hex chars). "latest"/"local" are not pinnable.
is_sha() {
  case $1 in
    '' | *[!0-9a-f]*) return 1 ;;
  esac
  [ "${#1}" -ge 7 ] && [ "${#1}" -le 40 ]
}

# ── 1. The release running now ──────────────────────────────────────────────────
# Preferred source: .deployed-tag, written by the last deploy that passed its health checks. Fallback (first
# run of this script): the tag of the image the API container runs, e.g. ghcr.io/o/pharmacy/api:<sha>.
PREV_TAG=""
if [ -f "$STATE_FILE" ]; then
  PREV_TAG=$(tr -d ' \r\n' < "$STATE_FILE")
fi
if ! is_sha "$PREV_TAG"; then
  running_image=$(docker inspect --format '{{.Config.Image}}' fsh-api 2>/dev/null || true)
  PREV_TAG=${running_image##*:}
fi
if is_sha "$PREV_TAG"; then
  log "currently running release: $PREV_TAG"
else
  PREV_TAG=""
  log "no sha-tagged release is running (first deploy?) — automatic rollback will not be possible"
fi

# ── Health probes ────────────────────────────────────────────────────────────────
# Both apps publish on 127.0.0.1 only (see docker-compose.yml); `docker compose port` finds the host port,
# whatever FSH_API_PORT / PHARMACY_APP_PORT are set to.
http_ok() { # $1 = URL; success on any 2xx/3xx answer within 5 s
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null --max-time 5 "$1" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null -T 5 "$1" 2>/dev/null
  else
    echo "neither curl nor wget is installed on the server; cannot health-check" >&2
    return 1
  fi
}

service_url() { # $1 = compose service, $2 = container port, $3 = path
  addr=$(docker compose port "$1" "$2" 2>/dev/null | tail -n 1)
  [ -n "$addr" ] || return 1
  echo "http://$addr$3"
}

# /health/live = the API process is up; /health/ready = it can reach its database, Redis, Hangfire and every
# tenant is migrated. The web app's home page proves the BFF serves (a redirect to sign-in counts).
api_live() { u=$(service_url api 8080 /health/live) && http_ok "$u"; }
api_ready() { u=$(service_url api 8080 /health/ready) && http_ok "$u"; }
web_ok() { u=$(service_url pharmacywebapp 3000 /) && http_ok "$u"; }

# ── 2. Was the API ready BEFORE we touched anything? ──────────────────────────────
REQUIRE_READY=0
if api_ready; then
  REQUIRE_READY=1
  log "API is ready now, so the new release must be ready too"
else
  log "API is not ready (or not running) before the deploy — only liveness will be required"
fi

wait_healthy() { # $1 = label for the log
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while :; do
    api=fail web=fail
    if [ "$REQUIRE_READY" = 1 ]; then api_ready && api=ok; else api_live && api=ok; fi
    web_ok && web=ok
    if [ "$api" = ok ] && [ "$web" = ok ]; then
      log "$1 is healthy"
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "$1 NOT healthy after ${HEALTH_TIMEOUT}s (api: $api, web: $web)"
      docker compose ps || true
      docker compose logs --tail 60 api pharmacywebapp migrator || true
      return 1
    fi
    sleep 5
  done
}

# Hosts fronted by nginx-proxy/acme-companion: make docker-gen re-render now, as its event watch can miss
# recreated containers (stale upstream IPs → 502/503). No-op elsewhere.
refresh_proxy() {
  for c in nginx-proxy letsencrypt-companion; do
    docker ps --format '{{.Names}}' | grep -qx "$c" || continue
    docker exec "$c" sh -c 'for p in /proc/[0-9]*; do grep -qa ^docker-gen "$p/cmdline" 2>/dev/null && kill -HUP "${p#/proc/}"; done' || true
  done
}

rollback() {
  if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" = "$NEW_TAG" ]; then
    log "ROLLBACK NOT POSSIBLE: no earlier sha-tagged release to return to (previous: '${PREV_TAG:-none}')."
    log "Fix forward, or start a known-good release by hand: IMAGE_TAG=<sha> sh scripts/deploy.sh"
    return 1
  fi
  log "ROLLING BACK to $PREV_TAG"
  IMAGE_TAG=$PREV_TAG
  export IMAGE_TAG
  # The previous images are normally still on disk (only dangling images are ever pruned); pull anyway in
  # case they were removed, but don't let a registry hiccup stop the rollback.
  docker compose pull --quiet || log "pull of $PREV_TAG failed; trying the local images"
  if docker compose up -d --no-build --remove-orphans; then
    refresh_proxy
    if wait_healthy "rollback release $PREV_TAG"; then
      log "rolled back to $PREV_TAG; the failed release $NEW_TAG is NOT live"
      return 0
    fi
  fi
  log "ROLLBACK TO $PREV_TAG ALSO FAILED — the site may be down; investigate now"
  return 1
}

# ── 3. Pull ───────────────────────────────────────────────────────────────────────
log "pulling release $NEW_TAG"
docker compose pull --quiet

# ── 4. Pre-deploy backup ──────────────────────────────────────────────────────────
if [ "${DEPLOY_BACKUP:-1}" = 0 ]; then
  log "DEPLOY_BACKUP=0: skipping the pre-deploy backup"
elif docker ps --format '{{.Names}}' | grep -qx fsh-postgres; then
  log "backing up the database before migrating"
  BACKUP_DIR=${DEPLOY_BACKUP_DIR:-$deploy_dir/backups} \
  BACKUP_TAG=predeploy \
  KEEP_COUNT=${DEPLOY_BACKUP_KEEP:-5} \
  BACKUP_ENV_FILE=$deploy_dir/.env \
    sh "$deploy_dir/scripts/backup.sh"
else
  log "postgres is not running yet (first deploy): nothing to back up"
fi

# ── 5 + 6. Roll forward and check ────────────────────────────────────────────────
log "starting release $NEW_TAG"
if docker compose up -d --no-build --remove-orphans; then
  refresh_proxy
  if wait_healthy "release $NEW_TAG"; then
    # ── 7. Success ──
    printf '%s\n' "$NEW_TAG" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    docker image prune -f >/dev/null || true
    docker compose ps
    log "deployed $NEW_TAG"
    exit 0
  fi
else
  log "docker compose up failed for $NEW_TAG (a failed migration shows up here)"
fi

# ── 7. Failure: roll back, and fail the job regardless ────────────────────────────
rollback || true
exit 1
