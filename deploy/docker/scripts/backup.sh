#!/usr/bin/env sh
# Postgres backup for the compose stack: one custom-format dump per run, old dumps pruned, and an optional
# copy off the server. Run nightly from cron, e.g.
#   15 2 * * * /opt/pharmacy/scripts/backup.sh >> /var/log/pharmacy-backup.log 2>&1
# The deploy workflow also runs it right before every rollout (BACKUP_TAG=predeploy, see deploy.sh).
#
# Settings (environment variables; all optional):
#   PG_CONTAINER / PG_USER / PG_DB   source container, role and database (fsh-postgres / fsh / fsh)
#   BACKUP_DIR    where dumps are written (default /var/backups/pharmacy)
#   BACKUP_TAG    label in the file name, e.g. "predeploy" → fsh-predeploy-<UTC time>.dump. Untagged runs
#                 write fsh-<UTC time>.dump. Pruning only ever touches dumps with the SAME label.
#   KEEP_COUNT    keep the newest N dumps of this label and delete older ones (count-based), or, when unset,
#   KEEP_DAYS     delete dumps of this label older than N days (age-based, default 14 — the original behaviour).
#   Off-site copy — a backup on the same disk is not a backup. Each is skipped while its variable is empty, so
#   with none set the script behaves exactly as before:
#     OFFSITE_RCLONE_REMOTE   rclone destination, e.g. "b2:pharmacy-backups/db" (needs rclone + a configured
#                             remote on this host; OFFSITE_RCLONE_CONFIG points at a non-default rclone.conf)
#     OFFSITE_S3_BUCKET       S3-compatible bucket (AWS, Backblaze B2, Cloudflare R2, Wasabi, MinIO…), uploaded
#                             with the amazon/aws-cli image (no host install needed), together with
#                             OFFSITE_S3_ACCESS_KEY, OFFSITE_S3_SECRET_KEY and optionally OFFSITE_S3_ENDPOINT
#                             (omit for AWS), OFFSITE_S3_REGION (default us-east-1), OFFSITE_S3_PREFIX
#                             (default "pharmacy/db").
#     OFFSITE_REQUIRED=1      make a failed off-site copy fail the script (default: warn and carry on, since
#                             the local dump did succeed).
#   OFFSITE_* values are also read from the compose .env next to this script (or BACKUP_ENV_FILE) when they
#   are not already set in the environment — so they can be configured once, in the server's .env.
# Off-site copies are never pruned by this script: use the bucket's lifecycle rules / versioning for that.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=env-file.sh
. "$script_dir/env-file.sh"
load_env_keys "${BACKUP_ENV_FILE:-$script_dir/../.env}" 'OFFSITE_[A-Z0-9_]+'

CONTAINER=${PG_CONTAINER:-fsh-postgres}
DB_USER=${PG_USER:-fsh}
DB_NAME=${PG_DB:-fsh}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pharmacy}
KEEP_DAYS=${KEEP_DAYS:-14}
KEEP_COUNT=${KEEP_COUNT:-}
BACKUP_TAG=${BACKUP_TAG:-}

case $BACKUP_TAG in
  *[!a-z0-9_-]*) echo "BACKUP_TAG may only contain a-z, 0-9, '-' and '_'" >&2; exit 2 ;;
esac
case $KEEP_COUNT in
  '') ;;
  *[!0-9]* | 0) echo "KEEP_COUNT must be a positive whole number" >&2; exit 2 ;;
esac

# File names: fsh-20261013T021500Z.dump (untagged) or fsh-predeploy-20261013T021500Z.dump (tagged). The
# glob for "this label" starts with a digit after the label, so untagged pruning never matches tagged dumps.
prefix="$DB_NAME-${BACKUP_TAG:+$BACKUP_TAG-}"

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/${prefix}$(date -u +%Y%m%dT%H%M%SZ).dump"

# -Fc: compressed custom format, restorable selectively with pg_restore.
# The password comes from the container's own POSTGRES_PASSWORD, never from this host.
# Written to .partial first and renamed only on success, so a failed dump never looks like a good one.
if ! docker exec "$CONTAINER" sh -c \
  "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -h localhost -U '$DB_USER' -d '$DB_NAME' -Fc --no-owner" \
  > "$out.partial"; then
  rm -f "$out.partial"
  echo "$(date -u +%FT%TZ) backup FAILED: pg_dump in $CONTAINER exited non-zero" >&2
  exit 1
fi
mv "$out.partial" "$out"
echo "$(date -u +%FT%TZ) backup ok: $out ($(du -h "$out" | cut -f1))"

# ── Pruning (only this label's dumps) ───────────────────────────────────────────
if [ -n "$KEEP_COUNT" ]; then
  # Newest first; everything after the first KEEP_COUNT goes. Names carry no spaces (fixed format above).
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR/$prefix"[0-9]*.dump 2>/dev/null | tail -n +"$((KEEP_COUNT + 1))" | while IFS= read -r old; do
    rm -f -- "$old" && echo "pruned $old"
  done
else
  find "$BACKUP_DIR" -maxdepth 1 -name "$prefix[0-9]*.dump" -mtime +"$KEEP_DAYS" -print -delete
fi

# ── Off-site copy (optional) ────────────────────────────────────────────────────
offsite_failed=0

if [ -n "${OFFSITE_RCLONE_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    if rclone ${OFFSITE_RCLONE_CONFIG:+--config "$OFFSITE_RCLONE_CONFIG"} copy "$out" "$OFFSITE_RCLONE_REMOTE"; then
      echo "$(date -u +%FT%TZ) off-site copy ok: rclone → $OFFSITE_RCLONE_REMOTE"
    else
      echo "$(date -u +%FT%TZ) WARNING: off-site copy via rclone to $OFFSITE_RCLONE_REMOTE failed" >&2
      offsite_failed=1
    fi
  else
    echo "$(date -u +%FT%TZ) WARNING: OFFSITE_RCLONE_REMOTE is set but rclone is not installed" >&2
    offsite_failed=1
  fi
fi

if [ -n "${OFFSITE_S3_BUCKET:-}" ]; then
  if [ -z "${OFFSITE_S3_ACCESS_KEY:-}" ] || [ -z "${OFFSITE_S3_SECRET_KEY:-}" ]; then
    echo "$(date -u +%FT%TZ) WARNING: OFFSITE_S3_BUCKET is set but OFFSITE_S3_ACCESS_KEY/OFFSITE_S3_SECRET_KEY are not" >&2
    offsite_failed=1
  else
    s3_key="${OFFSITE_S3_PREFIX:-pharmacy/db}/$(basename "$out")"
    # Credentials go in as environment variables of the throwaway container (not on its command line).
    # Same pinned aws-cli image the compose file already uses for the bucket init.
    if docker run --rm \
      -v "$BACKUP_DIR:/backup:ro" \
      -e AWS_ACCESS_KEY_ID="$OFFSITE_S3_ACCESS_KEY" \
      -e AWS_SECRET_ACCESS_KEY="$OFFSITE_S3_SECRET_KEY" \
      -e AWS_DEFAULT_REGION="${OFFSITE_S3_REGION:-us-east-1}" \
      amazon/aws-cli:2.37.12 \
      ${OFFSITE_S3_ENDPOINT:+--endpoint-url "$OFFSITE_S3_ENDPOINT"} \
      s3 cp --only-show-errors "/backup/$(basename "$out")" "s3://$OFFSITE_S3_BUCKET/$s3_key"; then
      echo "$(date -u +%FT%TZ) off-site copy ok: s3://$OFFSITE_S3_BUCKET/$s3_key"
    else
      echo "$(date -u +%FT%TZ) WARNING: off-site copy to s3://$OFFSITE_S3_BUCKET/$s3_key failed" >&2
      offsite_failed=1
    fi
  fi
fi

if [ "$offsite_failed" -ne 0 ] && [ "${OFFSITE_REQUIRED:-0}" = "1" ]; then
  echo "$(date -u +%FT%TZ) backup kept locally, but OFFSITE_REQUIRED=1 and the off-site copy failed" >&2
  exit 3
fi
