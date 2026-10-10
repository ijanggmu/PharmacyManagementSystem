#!/usr/bin/env sh
# Proves a dump is restorable: restores it into a throwaway database in the same
# Postgres container, compares per-table row counts with the live database, then
# drops the throwaway database. Never touches the live database.
#   ./restore-test.sh                      # newest dump in BACKUP_DIR
#   ./restore-test.sh /path/to/file.dump
set -eu

CONTAINER=${PG_CONTAINER:-fsh-postgres}
DB_USER=${PG_USER:-fsh}
DB_NAME=${PG_DB:-fsh}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pharmacy}
SCRATCH="${DB_NAME}_restore_test"

dump=${1:-$(ls -1t "$BACKUP_DIR/$DB_NAME"-*.dump | head -n 1)}
echo "restoring $dump into scratch database \"$SCRATCH\""

psql_in() { # $1 = database, rest = psql args
  db=$1; shift
  docker exec -i "$CONTAINER" sh -c "PGOPTIONS='-c client_min_messages=warning' PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -h localhost -U '$DB_USER' -d '$db' -v ON_ERROR_STOP=1 $*"
}

psql_in postgres -qc "\"DROP DATABASE IF EXISTS \\\"$SCRATCH\\\"\""
psql_in postgres -qc "\"CREATE DATABASE \\\"$SCRATCH\\\"\""
trap 'psql_in postgres -qc "\"DROP DATABASE IF EXISTS \\\"$SCRATCH\\\"\"" >/dev/null' EXIT

docker exec -i "$CONTAINER" sh -c \
  "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_restore -h localhost -U '$DB_USER' -d '$SCRATCH' --no-owner --exit-on-error" \
  < "$dump"

# Exact row count of every user table, as "schema.table|count".
COUNTS="SELECT table_schema || '.' || table_name || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1"

tmp=$(mktemp -d)
echo "$COUNTS" | psql_in "$DB_NAME" -At > "$tmp/live"
echo "$COUNTS" | psql_in "$SCRATCH" -At > "$tmp/restored"

tables=$(wc -l < "$tmp/restored" | tr -d ' ')
rows=$(awk -F'|' '{s+=$2} END {print s+0}' "$tmp/restored")
if diff "$tmp/live" "$tmp/restored" > "$tmp/diff"; then
  echo "restore OK: $tables tables, $rows rows, counts match the live database"
else
  echo "restore finished but row counts differ (expected only if the live DB was written to since the dump):"
  cat "$tmp/diff"
  exit 1
fi
rm -rf "$tmp"
