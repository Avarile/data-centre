# Local Server Setup

1. apps/nextjs-app/.env.development.local => local dev server env file
   - PostgreSQL: appuser @ 127.0.0.1:9898 / appdb
   - Redis: 127.0.0.1:6490
   - MinIO: 127.0.0.1:9000 (provider=minio)

##### Database Migration

Run this once after first checkout, or after schema changes.
Do NOT use `make switch-db-mode` — it overwrites the env file and spins up its own container.

```bash
PRISMA_DATABASE_URL="postgresql://appuser:wxgnA33EQ27Ms6wR97AS0PECYqynWw02@127.0.0.1:9898/cybernetics?schema=public&statement_cache_size=1" make postgres.mode
```

##### initial the MinIO buckets:
`bash scripts/customized/start-server/local/create-minio-buckets.sh`

##### Start Dev Server

```bash
cd apps/nestjs-backend && pnpm install && pnpm dev
```


``` how to solve the nextjs-lock issue
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; true
rm -rf apps/nextjs-app/.next/dev
```
