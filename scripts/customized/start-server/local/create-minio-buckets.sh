#!/usr/bin/env bash
set -euo pipefail

MINIO_CONTAINER=minio
MINIO_USER=UfmS3f0HT3yCiS8
MINIO_PASSWORD=OftTepOnHc2HwyZmNT8l5NGWU1QzLrjccGW79cZ3
ALIAS=local

docker exec "$MINIO_CONTAINER" mc alias set "$ALIAS" http://localhost:9000 "$MINIO_USER" "$MINIO_PASSWORD"
docker exec "$MINIO_CONTAINER" mc mb --ignore-existing "$ALIAS/public"
docker exec "$MINIO_CONTAINER" mc anonymous set public "$ALIAS/public"
docker exec "$MINIO_CONTAINER" mc mb --ignore-existing "$ALIAS/private"

echo "Buckets ready."
