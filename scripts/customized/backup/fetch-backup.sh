#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="Micro-server"
REMOTE_PATH="/home/avarile/teable_backup.sql"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_FILE="$LOCAL_DIR/teable_backup.sql"

echo "Fetching backup from $REMOTE_HOST:$REMOTE_PATH..."
scp "$REMOTE_HOST:$REMOTE_PATH" "$LOCAL_FILE"
echo "Saved to $LOCAL_FILE"
