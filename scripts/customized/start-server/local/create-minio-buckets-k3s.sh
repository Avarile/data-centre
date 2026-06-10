  #!/usr/bin/env bash
  set -euo pipefail

  NAMESPACE=infra
  MINIO_USER=minioadmin
  MINIO_PASSWORD='MinioStr0ng#Pass2025!'
  ALIAS=local

  # Resolve pod name dynamically
  POD=$(kubectl get pod -n "$NAMESPACE" -l app=minio -o jsonpath='{.items[0].metadata.name}')

  kubectl exec -n "$NAMESPACE" "$POD" -- mc alias set "$ALIAS" http://localhost:9000 "$MINIO_USER" "$MINIO_PASSWORD"
  kubectl exec -n "$NAMESPACE" "$POD" -- mc mb --ignore-existing "$ALIAS/public"
  kubectl exec -n "$NAMESPACE" "$POD" -- mc anonymous set public "$ALIAS/public"
  kubectl exec -n "$NAMESPACE" "$POD" -- mc mb --ignore-existing "$ALIAS/private"

  echo "Buckets ready."
