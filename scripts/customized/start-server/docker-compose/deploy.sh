#!/usr/bin/env bash
# Now you pass just the version tag (e.g., deploy.sh release.2026-05-14T12-28-44Z.1) and the script constructs the full image name as cybernetics:release.2026-05-14T12-28-44Z.1. The rest of the script remains unchanged since IMAGE is still used throughout.
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
REMOTE_HOST="Micro-server"
REMOTE_COMPOSE_DIR="/home/avarile/Deployment/Docker/teable"
REMOTE_COMPOSE="${REMOTE_COMPOSE_DIR}/docker-compose.yaml"
SERVICE_NAME="teable"
IMAGE_PREFIX="cybernetics"
VERSION=""
NO_RESTART=false

# ─── Args ─────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-restart) NO_RESTART=true; shift ;;
    -*) echo "Unknown flag: $1"; exit 1 ;;
    *)  VERSION="$1"; shift ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $(basename "$0") [--no-restart] <version>"
  echo "  e.g.: $(basename "$0") release.2026-05-14T12-28-44Z.1"
  exit 1
fi

IMAGE="${IMAGE_PREFIX}:${VERSION}"

if ! docker image inspect "$IMAGE" &>/dev/null; then
  echo "Error: image '$IMAGE' not found locally"
  exit 1
fi

# ─── 1. Transfer ──────────────────────────────────────────────────────────────
echo "[1/3] Transferring ${IMAGE} → ${REMOTE_HOST}..."
docker save "$IMAGE" | ssh "$REMOTE_HOST" docker load
echo "      Transfer complete."

# ─── 2. Update docker-compose.yaml ───────────────────────────────────────────
echo "[2/3] Updating image tag in ${REMOTE_COMPOSE}..."
ssh "$REMOTE_HOST" "sed -i 's|image: ${IMAGE_PREFIX}:.*|image: ${IMAGE}|' '${REMOTE_COMPOSE}'"
echo "      Image tag updated to: ${IMAGE}"

# ─── 3. Restart service ───────────────────────────────────────────────────────
if [[ "$NO_RESTART" == "true" ]]; then
  echo "[3/3] Skipped restart (--no-restart). Run manually:"
  echo "      ssh ${REMOTE_HOST} \"cd ${REMOTE_COMPOSE_DIR} && docker compose up -d --no-deps --pull never ${SERVICE_NAME}\""
else
  echo "[3/3] Restarting ${SERVICE_NAME} on ${REMOTE_HOST}..."
  ssh "$REMOTE_HOST" "cd '${REMOTE_COMPOSE_DIR}' && docker compose up -d --no-deps --pull never ${SERVICE_NAME}"
  echo "      Service restarted."
fi

echo ""
echo "Done. Deployed ${IMAGE} to ${REMOTE_HOST}."
