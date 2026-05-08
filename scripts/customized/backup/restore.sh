#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="/home/avarile/Documents/dev-ops/postgres/teable_backup.sql"
CONTAINER="standalone-teable-db-1"
POSTGRES_USER="example"
POSTGRES_DB="example"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Error: backup file not found at $BACKUP_FILE"
  exit 1
fi

if ! docker inspect "$CONTAINER" &>/dev/null; then
  echo "Error: container '$CONTAINER' is not running"
  exit 1
fi

echo "Restoring $BACKUP_FILE into $CONTAINER ($POSTGRES_DB)..."

# Drop and recreate the database to ensure a clean restore
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE $POSTGRES_DB;"

# Stream the backup file into the container and restore
docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_FILE"

echo "Restore complete."
