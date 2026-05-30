import Link from "next/link"
import { ChevronRight, Database, Server } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const envGroups: {
  label: string
  required?: boolean
  vars: { name: string; example: string; desc: string }[]
}[] = [
  {
    label: "Core (required)",
    required: true,
    vars: [
      {
        name: "PUBLIC_ORIGIN",
        example: "http://127.0.0.1:3000",
        desc: "Public-facing URL of this instance — used in email links and CORS",
      },
      {
        name: "SECRET_KEY",
        example: "change-me-32chars-min",
        desc: "Master secret for JWT signing and session encryption — change before first launch",
      },
      {
        name: "PRISMA_DATABASE_URL",
        example: "postgresql://user:pass@host:5432/db",
        desc: "Full PostgreSQL connection string",
      },
      {
        name: "POSTGRES_DB",
        example: "cybernetics",
        desc: "Database name (used inside Docker Compose)",
      },
      {
        name: "POSTGRES_USER",
        example: "cybernetics",
        desc: "PostgreSQL username",
      },
      {
        name: "POSTGRES_PASSWORD",
        example: "strong-password",
        desc: "PostgreSQL password",
      },
      {
        name: "REDIS_PASSWORD",
        example: "strong-password",
        desc: "Redis auth password",
      },
      {
        name: "BACKEND_CACHE_REDIS_URI",
        example: "redis://default:pass@cache:6379/0",
        desc: "Redis connection URI for sessions and job queue",
      },
      {
        name: "TIMEZONE",
        example: "UTC",
        desc: "Container timezone (e.g. America/New_York)",
      },
    ],
  },
  {
    label: "Storage",
    vars: [
      {
        name: "BACKEND_STORAGE_PROVIDER",
        example: "local",
        desc: "local (default) | s3 | minio",
      },
      {
        name: "BACKEND_STORAGE_LOCAL_PATH",
        example: ".assets/uploads",
        desc: "Path for local uploads (only used when provider=local)",
      },
      {
        name: "BACKEND_STORAGE_S3_REGION",
        example: "us-east-1",
        desc: "AWS S3 region",
      },
      {
        name: "BACKEND_STORAGE_S3_ACCESS_KEY",
        example: "AKIA…",
        desc: "AWS access key",
      },
      {
        name: "BACKEND_STORAGE_S3_SECRET_KEY",
        example: "wJal…",
        desc: "AWS secret key",
      },
      {
        name: "BACKEND_STORAGE_MINIO_ENDPOINT",
        example: "minio.example.com",
        desc: "MinIO host (when provider=minio)",
      },
      {
        name: "BACKEND_STORAGE_MINIO_ACCESS_KEY",
        example: "access-key",
        desc: "MinIO access key",
      },
      {
        name: "BACKEND_STORAGE_MINIO_SECRET_KEY",
        example: "secret-key",
        desc: "MinIO secret key",
      },
    ],
  },
  {
    label: "Social Login (OAuth)",
    vars: [
      {
        name: "SOCIAL_AUTH_PROVIDERS",
        example: "github,google",
        desc: "Comma-separated list of enabled providers",
      },
      {
        name: "BACKEND_GITHUB_CLIENT_ID",
        example: "Iv1.abc123",
        desc: "GitHub OAuth app client ID",
      },
      {
        name: "BACKEND_GITHUB_CLIENT_SECRET",
        example: "secret",
        desc: "GitHub OAuth app client secret",
      },
      {
        name: "BACKEND_GITHUB_CALLBACK_URL",
        example: "https://…/api/auth/github/callback",
        desc: "Must match the URL registered in GitHub",
      },
      {
        name: "BACKEND_GOOGLE_CLIENT_ID",
        example: "….apps.googleusercontent.com",
        desc: "Google OAuth 2.0 client ID",
      },
      {
        name: "BACKEND_GOOGLE_CLIENT_SECRET",
        example: "GOCSPX-…",
        desc: "Google OAuth 2.0 client secret",
      },
      {
        name: "BACKEND_OIDC_CLIENT_ID",
        example: "client-id",
        desc: "Custom OIDC client ID",
      },
      {
        name: "BACKEND_OIDC_AUTHORIZATION_URL",
        example: "https://…/authorize",
        desc: "OIDC authorization endpoint",
      },
    ],
  },
  {
    label: "Email (SMTP)",
    vars: [
      {
        name: "BACKEND_MAIL_HOST",
        example: "smtp.gmail.com",
        desc: "SMTP server hostname",
      },
      {
        name: "BACKEND_MAIL_PORT",
        example: "465",
        desc: "SMTP port (465 for SSL, 587 for TLS)",
      },
      {
        name: "BACKEND_MAIL_SECURE",
        example: "true",
        desc: "true for port 465 (SSL), false for STARTTLS",
      },
      {
        name: "BACKEND_MAIL_SENDER",
        example: "noreply@example.com",
        desc: "From address for outgoing mail",
      },
      {
        name: "BACKEND_MAIL_AUTH_USER",
        example: "user@example.com",
        desc: "SMTP authentication username",
      },
      {
        name: "BACKEND_MAIL_AUTH_PASS",
        example: "app-password",
        desc: "SMTP password or app-specific token",
      },
    ],
  },
  {
    label: "AI / LLM",
    vars: [
      {
        name: "AI_GATEWAY_API_KEY",
        example: "sk-…",
        desc: "Vercel AI Gateway key (fallback when per-base AI key is unset)",
      },
      {
        name: "GOOGLE_GENAI_API_KEY",
        example: "AIzaSy…",
        desc: "Google Gemini API key",
      },
      {
        name: "ELEVENLABS_API_KEY",
        example: "…",
        desc: "ElevenLabs key — enables text-to-speech in AI chat",
      },
      {
        name: "ELEVENLABS_VOICE_ID",
        example: "nPczCjzI2devNBz1zQrb",
        desc: "Default TTS voice ID",
      },
    ],
  },
  {
    label: "Limits & Tuning",
    vars: [
      {
        name: "MAX_FREE_ROW_LIMIT",
        example: "100000",
        desc: "Row cap for spaces without a credit — leave empty for unlimited",
      },
      {
        name: "MAX_READ_ROWS",
        example: "10000",
        desc: "Max records returned per API request",
      },
      {
        name: "MAX_ATTACHMENT_UPLOAD_SIZE",
        example: "2147483648",
        desc: "Max file upload size in bytes (default 2 GB)",
      },
      {
        name: "PRISMA_TRANSACTION_TIMEOUT",
        example: "100000",
        desc: "Transaction timeout in ms — increase for bulk updates",
      },
      {
        name: "TRASH_RETENTION",
        example: "30d",
        desc: "How long deleted records stay in trash before permanent removal",
      },
      {
        name: "LOG_LEVEL",
        example: "info",
        desc: "fatal | error | warn | info | debug | trace",
      },
    ],
  },
]

const dockerCompose = `services:
  cybernetics:
    image: cybernetics:latest
    restart: always
    ports:
      - '3000:3000'
    volumes:
      - cybernetics-data:/app/.assets:rw
    env_file:
      - .env
    environment:
      - TZ=\${TIMEZONE}
    networks:
      - cybernetics-net
    depends_on:
      cybernetics-db:
        condition: service_healthy
      cybernetics-cache:
        condition: service_healthy

  cybernetics-db:
    image: pgvector/pgvector:pg17
    restart: always
    ports:
      - '42345:5432'
    volumes:
      - cybernetics-db:/var/lib/postgresql/data:rw
    environment:
      - TZ=\${TIMEZONE}
      - POSTGRES_DB=\${POSTGRES_DB}
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
    networks:
      - cybernetics-net
    healthcheck:
      test: ['CMD-SHELL', "sh -c 'pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}'"]
      interval: 10s
      timeout: 3s
      retries: 3

  cybernetics-cache:
    image: redis:7.4-alpine
    restart: always
    volumes:
      - cybernetics-cache:/data:rw
    networks:
      - cybernetics-net
    command: redis-server --appendonly yes --requirepass \${REDIS_PASSWORD}
    healthcheck:
      test: ['CMD', 'redis-cli', '--raw', 'incr', 'ping']
      interval: 10s
      timeout: 3s
      retries: 3

networks:
  cybernetics-net:
    driver: bridge

volumes:
  cybernetics-data: {}
  cybernetics-db: {}
  cybernetics-cache: {}`

const dotenv = `TIMEZONE=UTC

# ── PostgreSQL ─────────────────────────────────────────────
POSTGRES_HOST=cybernetics-db
POSTGRES_PORT=5432
POSTGRES_DB=cybernetics
POSTGRES_USER=cybernetics
POSTGRES_PASSWORD=CHANGE_ME

# ── Redis ──────────────────────────────────────────────────
REDIS_HOST=cybernetics-cache
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=CHANGE_ME

# ── App ────────────────────────────────────────────────────
PUBLIC_ORIGIN=http://127.0.0.1:3000
SECRET_KEY=CHANGE_ME_32_CHAR_RANDOM_STRING

PRISMA_DATABASE_URL=postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
PUBLIC_DATABASE_PROXY=127.0.0.1:42345
PRISMA_TRANSACTION_TIMEOUT=100000
PRISMA_TRANSACTION_MAX_WAIT=5000

BACKEND_CACHE_PROVIDER=redis
BACKEND_CACHE_REDIS_URI=redis://default:\${REDIS_PASSWORD}@\${REDIS_HOST}:\${REDIS_PORT}/\${REDIS_DB}

# ── Storage (local by default) ─────────────────────────────
BACKEND_STORAGE_PROVIDER=local
BACKEND_STORAGE_LOCAL_PATH=.assets/uploads

# ── Email (optional — needed for invitations & password reset)
# BACKEND_MAIL_HOST=smtp.gmail.com
# BACKEND_MAIL_PORT=465
# BACKEND_MAIL_SECURE=true
# BACKEND_MAIL_SENDER=noreply@example.com
# BACKEND_MAIL_AUTH_USER=you@example.com
# BACKEND_MAIL_AUTH_PASS=app-specific-password

# ── AI (optional) ──────────────────────────────────────────
# AI_GATEWAY_API_KEY=
# GOOGLE_GENAI_API_KEY=
# ELEVENLABS_API_KEY=`

export default function SelfHostingDocsPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3 text-sm text-muted-foreground">
          <Database className="size-4" />
          <Link href="/" className="font-heading font-semibold text-foreground">
            Cybernetics
          </Link>
          <ChevronRight className="size-3" />
          <span>Self-Hosting</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
        {/* Hero */}
        <section className="space-y-3">
          <Badge variant="secondary">Deploy</Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Self-Hosting
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Run Cybernetics on your own infrastructure. The standalone Docker
            Compose setup bundles the app, PostgreSQL (pgvector), and Redis in
            one command.
          </p>
        </section>

        {/* Requirements */}
        <section id="requirements" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">Requirements</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Docker",
                value: "≥ 24",
                desc: "Docker Engine + Compose v2",
              },
              {
                title: "RAM",
                value: "≥ 2 GB",
                desc: "Minimum for standalone deploy",
              },
              {
                title: "Disk",
                value: "≥ 10 GB",
                desc: "DB, uploads, and logs",
              },
              {
                title: "PostgreSQL",
                value: "pgvector/pgvector:pg17",
                desc: "Bundled in compose; bring-your-own also supported",
              },
              {
                title: "Redis",
                value: "7.4-alpine",
                desc: "Bundled in compose; external Redis also supported",
              },
              {
                title: "Ports",
                value: "3000, 42345",
                desc: "App (3000) and external DB proxy (42345)",
              },
            ].map((r) => (
              <div key={r.title} className="space-y-0.5 rounded-lg border p-4">
                <p className="font-heading font-mono text-sm font-semibold">
                  {r.value}
                </p>
                <p className="text-xs font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs: Docker vs manual */}
        <section id="docker-compose" className="scroll-mt-16 space-y-5">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <Server className="size-5 text-muted-foreground" />
            Deployment
          </h2>

          <Tabs defaultValue="compose">
            <TabsList>
              <TabsTrigger value="compose">Docker Compose</TabsTrigger>
              <TabsTrigger value="env">Environment File</TabsTrigger>
              <TabsTrigger value="steps">Step-by-step</TabsTrigger>
            </TabsList>

            {/* docker-compose.yaml */}
            <TabsContent value="compose" className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Save as{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  docker-compose.yml
                </code>{" "}
                alongside your{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  .env
                </code>{" "}
                file. This matches the structure in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  dockers/examples/standalone/
                </code>
                .
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-4 font-mono text-xs leading-relaxed">
                {dockerCompose}
              </pre>
            </TabsContent>

            {/* .env */}
            <TabsContent value="env" className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Create a{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  .env
                </code>{" "}
                file next to your compose file. Replace all{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  CHANGE_ME
                </code>{" "}
                values before launching.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-4 font-mono text-xs leading-relaxed">
                {dotenv}
              </pre>
            </TabsContent>

            {/* step by step */}
            <TabsContent value="steps" className="mt-3">
              <ol className="space-y-4 text-sm text-muted-foreground">
                {[
                  {
                    label: "Create a working directory",
                    code: "mkdir cybernetics && cd cybernetics",
                  },
                  {
                    label: "Copy the compose file from the repo",
                    code: "# from inside the monorepo:\ncp dockers/examples/standalone/docker-compose.yaml docker-compose.yml",
                  },
                  {
                    label: "Create and edit the .env file",
                    code: "# replace CHANGE_ME values before launching\ncp dockers/examples/standalone/.env .env\nnano .env",
                  },
                  {
                    label: "Start all services",
                    code: "docker compose up -d",
                  },
                  {
                    label: "Tail logs to confirm healthy start",
                    code: "docker compose logs -f cybernetics",
                  },
                  {
                    label: "Open the app",
                    code: "open http://localhost:3000",
                  },
                ].map((step, i) => (
                  <li key={i} className="space-y-2">
                    <div className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="font-medium text-foreground">
                        {step.label}
                      </span>
                    </div>
                    <pre className="ml-9 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                      {step.code}
                    </pre>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </Tabs>
        </section>

        {/* File Structure */}
        <section id="file-structure" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Monorepo File Structure
          </h2>
          <p className="text-sm text-muted-foreground">
            The deploy artifacts are produced from this monorepo layout:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-4 font-mono text-xs leading-relaxed">
            {`.
├── apps/                          # AGPL 3.0
│   ├── nestjs-backend/            # REST API — NestJS + Prisma + ShareDB
│   │   ├── src/
│   │   │   ├── app.module.ts      # root module — registers all feature modules
│   │   │   └── features/         # domain modules (space, base, table, record…)
│   │   └── .env.example          # full list of supported env vars
│   ├── nextjs-app/                # Front-end — Next.js
│   │   └── .env.example          # frontend env vars (PUBLIC_ORIGIN, etc.)
│   └── nextjs-statics/           # Static sites (homepage, tech-guides)
│       ├── homepage/
│       └── tech-guides/           # ← you are here
├── packages/                      # MIT
│   ├── core/                      # shared types and interfaces
│   ├── sdk/                       # plugin SDK for third-party extensions
│   ├── db-main-prisma/            # PostgreSQL schema + Prisma migrations
│   │   └── prisma/postgres/schema.prisma
│   ├── db-data-prisma/            # data-specific Prisma schema
│   ├── ui-lib/                    # shared shadcn/Radix UI component library
│   └── common-i18n/               # i18n strings
├── plugins/                       # AGPL 3.0 — first-party plugins (chart, etc.)
├── dockers/
│   ├── examples/
│   │   └── standalone/            # ← quickstart compose + .env template
│   ├── database-postgres.yml      # standalone Postgres service
│   ├── cache-redis.yml            # standalone Redis service
│   └── storage-minio.yml          # standalone MinIO service
├── scripts/                       # build, migration, and tooling scripts
├── Makefile                       # dev shortcuts (switch-db-mode, gen-prisma-schema…)
└── pnpm-workspace.yaml            # pnpm monorepo workspace config`}
          </pre>
        </section>

        {/* Env var reference */}
        <section id="env" className="scroll-mt-16 space-y-6">
          <h2 className="font-heading text-xl font-semibold">
            Environment Variable Reference
          </h2>
          {envGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
                {group.label}
                {group.required && (
                  <Badge variant="destructive" className="text-xs">
                    required
                  </Badge>
                )}
              </h3>
              <div className="divide-y rounded-lg border text-sm">
                {group.vars.map((v) => (
                  <div
                    key={v.name}
                    className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 px-3 py-2.5"
                  >
                    <code className="self-center font-mono text-xs">
                      {v.name}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {v.desc}
                    </span>
                    <span />
                    <code className="font-mono text-xs text-muted-foreground/70">
                      {v.example}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            The full list (300+ variables) is in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              apps/nextjs-app/.env.example
            </code>
            .
          </p>
        </section>

        {/* Cloud providers */}
        <section id="cloud-providers" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Cloud Providers
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "AWS",
                desc: "Deploy on ECS or EKS. Use RDS (PostgreSQL + pgvector extension) and ElastiCache (Redis). Set BACKEND_STORAGE_PROVIDER=s3 and provide BACKEND_STORAGE_S3_* vars for attachments.",
              },
              {
                title: "GCP",
                desc: "Deploy on Cloud Run or GKE. Use Cloud SQL (PostgreSQL) and Memorystore (Redis). Attachments can use GCS via the S3-compatible API.",
              },
              {
                title: "Azure",
                desc: "Deploy on AKS or Container Apps. Use Azure Database for PostgreSQL Flexible Server and Azure Cache for Redis. Use Azure Blob Storage with the S3-compatible endpoint.",
              },
              {
                title: "Fly.io / Railway / Render",
                desc: "Use the Docker image directly. Provision Postgres and Redis addons from the platform marketplace, then set the required env vars in the platform dashboard.",
              },
            ].map((p) => (
              <Card key={p.title}>
                <CardHeader>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Upgrade */}
        <section id="upgrade" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">Upgrade Guide</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              {
                label: "Back up PostgreSQL first",
                code: "docker exec cybernetics-db pg_dump -U cybernetics cybernetics > backup.sql",
              },
              { label: "Pull the new image", code: "docker compose pull" },
              { label: "Restart services", code: "docker compose up -d" },
              {
                label: "Confirm migrations ran",
                code: "docker compose logs cybernetics | grep 'migration'",
              },
            ].map((step, i) => (
              <li key={i} className="space-y-2">
                <div className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="font-medium text-foreground">
                    {step.label}
                  </span>
                </div>
                <pre className="ml-9 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                  {step.code}
                </pre>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Migrations run automatically on startup via Prisma. Check the
            changelog for any breaking env-var changes before upgrading.
          </p>
        </section>

        <section className="space-y-4 pb-8">
          <Separator />
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              ← Back to Support
            </Link>
            <Link href="/docs/api" className="hover:text-foreground">
              API Reference
            </Link>
            <Link href="/docs/plugins" className="hover:text-foreground">
              Plugin Development
            </Link>
            <Link href="/docs/contributing" className="hover:text-foreground">
              Contributing
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
