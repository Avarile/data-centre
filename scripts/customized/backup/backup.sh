#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="/home/avarile/Documents/dev-ops/infra/teable_backup.sql"
CONTAINER="infra-postgres-1"
POSTGRES_USER="avarile"
POSTGRES_DB="cybernetics"

if ! docker inspect "$CONTAINER" &>/dev/null; then
  echo "Error: container '$CONTAINER' is not running"
  exit 1
fi

echo "Backing up $POSTGRES_DB from $CONTAINER to $BACKUP_FILE..."

docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$BACKUP_FILE"

echo "Backup complete: $BACKUP_FILE"
