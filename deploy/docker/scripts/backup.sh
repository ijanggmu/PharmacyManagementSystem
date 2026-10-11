#!/usr/bin/env sh
# Postgres backup for the compose stack: one custom-format dump per run,
# dumps older than KEEP_DAYS deleted. Run nightly from cron, e.g.
#   15 2 * * * /opt/pharmacy/deploy/docker/scripts/backup.sh >> /var/log/pharmacy-backup.log 2>&1
# then copy BACKUP_DIR off the server (rclone/rsync) — a backup on the same disk is not a backup.
set -eu

CONTAINER=${PG_CONTAINER:-fsh-postgres}
DB_USER=${PG_USER:-fsh}
DB_NAME=${PG_DB:-fsh}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pharmacy}
KEEP_DAYS=${KEEP_DAYS:-14}

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/$DB_NAME-$(date -u +%Y%m%dT%H%M%SZ).dump"

# -Fc: compressed custom format, restorable selectively with pg_restore.
# The password comes from the container's own POSTGRES_PASSWORD, never from this host.
docker exec "$CONTAINER" sh -c \
  "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -h localhost -U '$DB_USER' -d '$DB_NAME' -Fc --no-owner" \
  > "$out.partial"
mv "$out.partial" "$out"

find "$BACKUP_DIR" -name "$DB_NAME-*.dump" -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok: $out ($(du -h "$out" | cut -f1))"
