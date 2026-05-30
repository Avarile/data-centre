import Link from "next/link"
import { ChevronRight, Database, GitBranch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ContributingDocsPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3 text-sm text-muted-foreground">
          <Database className="size-4" />
          <Link href="/" className="font-heading font-semibold text-foreground">
            Cybernetics
          </Link>
          <ChevronRight className="size-3" />
          <span>Contributing</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
        <section className="space-y-3">
          <Badge variant="secondary">Open Source</Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Contributing
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Cybernetics is an open-source monorepo. The base branch is{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              develop
            </code>
            . This guide covers local setup, the monorepo structure, the dev
            workflow, and how to run tests.
          </p>
        </section>

        {/* Prerequisites */}
        <section id="prerequisites" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">Prerequisites</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Node.js",
                value: "≥ 22",
                desc: "Use nvm or fnm to manage versions",
              },
              {
                title: "pnpm",
                value: "≥ 9.13",
                desc: "Managed via corepack — see step 1 below",
              },
              {
                title: "Docker",
                value: "≥ 24",
                desc: "Needed to run Postgres + Redis via make switch-db-mode",
              },
              { title: "Git", value: "any", desc: "SSH clone recommended" },
              {
                title: "Make",
                value: "any",
                desc: "GNU Make for db shortcuts (pre-installed on Linux/macOS)",
              },
              {
                title: "OS",
                value: "Linux / macOS",
                desc: "Windows: use WSL2",
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

        {/* Local setup */}
        <section id="local-setup" className="scroll-mt-16 space-y-5">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <GitBranch className="size-5 text-muted-foreground" />
            Local Setup
          </h2>
          <ol className="space-y-4 text-sm text-muted-foreground">
            {[
              {
                label: "Enable corepack (manages pnpm version automatically)",
                code: "corepack enable",
              },
              {
                label: "Clone and install dependencies",
                code: "git clone git@github.com:your-org/cybernetics.git\ncd cybernetics\npnpm install",
              },
              {
                label: "Start Postgres + Redis and run migrations",
                code: "# starts Docker containers and applies Prisma migrations\nmake switch-db-mode",
              },
              {
                label:
                  "Configure frontend env (optional — only needed to override defaults)",
                code: "cd apps/nextjs-app\ncp .env.development .env.development.local\n# edit .env.development.local as needed",
              },
              {
                label:
                  "Start the dev server — backend starts the Next.js frontend automatically",
                code: "cd apps/nestjs-backend\npnpm dev",
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

          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p className="font-medium">Default ports in dev mode</p>
            <div className="divide-y rounded-lg border font-mono text-xs">
              {[
                { port: "3000", desc: "App (backend + Next.js frontend)" },
                {
                  port: "3001",
                  desc: "WebSocket (hot-reload in dev — production uses 3000)",
                },
                { port: "3002", desc: "Plugin development server" },
                { port: "42345", desc: "PostgreSQL external proxy" },
              ].map((r) => (
                <div
                  key={r.port}
                  className="flex items-center gap-4 px-3 py-1.5"
                >
                  <span className="w-12 shrink-0 text-muted-foreground">
                    {r.port}
                  </span>
                  <span className="font-sans text-muted-foreground">
                    {r.desc}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              If the backend restarts during hot-reload and port 3000 is stuck,
              run{" "}
              <code className="rounded bg-muted px-1 py-0.5">lsof -i:3000</code>{" "}
              then{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                kill -9 [pid]
              </code>{" "}
              and restart.
            </p>
          </div>
        </section>

        {/* Plugin dev */}
        <section id="plugin-dev" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Plugin Development
          </h2>
          <p className="text-sm text-muted-foreground">
            The plugin server is not started by default. To develop and preview
            plugins:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
            {`# build shared packages first (required once, or after package changes)
pnpm build:packages

# start the plugin dev server on port 3002
cd plugins
pnpm dev`}
          </pre>
        </section>

        {/* File structure */}
        <section id="structure" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Monorepo File Structure
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-4 font-mono text-xs leading-relaxed">
            {`.
├── apps/                          # AGPL 3.0
│   ├── nestjs-backend/            # REST API
│   │   ├── src/
│   │   │   ├── app.module.ts      # root NestJS module
│   │   │   └── features/         # domain modules
│   │   │       ├── space/         # Spaces API
│   │   │       ├── base/          # Bases API
│   │   │       ├── table/         # Tables API
│   │   │       ├── field/         # Fields API
│   │   │       ├── record/        # Records API
│   │   │       ├── view/          # Views API
│   │   │       ├── ai/            # AI / LLM integrations
│   │   │       ├── plugin/        # Plugin management
│   │   │       ├── auth/          # Auth (local + OAuth + OIDC)
│   │   │       ├── attachment/    # File uploads (local / S3 / MinIO)
│   │   │       └── webhook/       # Outbound webhooks
│   │   └── .env.example           # full env var reference
│   ├── nextjs-app/                # Front-end (Next.js)
│   │   ├── app/                   # App Router pages
│   │   └── .env.development       # default dev env
│   └── nextjs-statics/
│       ├── homepage/              # Marketing site
│       └── tech-guides/           # ← this documentation site
├── packages/                      # MIT
│   ├── core/                      # shared types, interfaces, utilities
│   ├── sdk/                       # Plugin SDK for third-party extensions
│   ├── db-main-prisma/            # PostgreSQL schema + Prisma migrations
│   │   └── prisma/
│   │       ├── template.prisma    # edit schema here
│   │       └── postgres/
│   │           └── schema.prisma  # generated — do not edit directly
│   ├── db-data-prisma/            # data-specific Prisma schema
│   ├── ui-lib/                    # shared shadcn/Radix UI component library
│   └── common-i18n/               # i18n strings (MIT)
├── plugins/                       # AGPL 3.0 — first-party plugins
├── dockers/
│   ├── examples/
│   │   └── standalone/            # quickstart compose + .env template
│   ├── database-postgres.yml
│   ├── cache-redis.yml
│   └── storage-minio.yml
├── scripts/                       # build and tooling scripts
├── Makefile                       # dev shortcuts
├── pnpm-workspace.yaml
└── tsconfig.base.json             # shared TS config`}
          </pre>
        </section>

        {/* Database migration */}
        <section id="migrations" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Database Migration Workflow
          </h2>
          <p className="text-sm text-muted-foreground">
            Schema changes go through Prisma. Never edit{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              schema.prisma
            </code>{" "}
            directly — edit the template then generate.
          </p>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              {
                label: "Edit the schema template",
                code: "# edit packages/db-main-prisma/prisma/template.prisma",
              },
              {
                label: "Generate Prisma schemas",
                code: "make gen-prisma-schema",
              },
              { label: "Create a migration file", code: "make db-migration" },
              { label: "Apply to dev database", code: "make switch-db-mode" },
            ].map((step, i) => (
              <li key={i} className="space-y-2">
                <div className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span>{step.label}</span>
                </div>
                <pre className="ml-9 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                  {step.code}
                </pre>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            To reset the dev database after schema changes: run{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              pnpm prisma-migrate-reset
            </code>{" "}
            inside
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              packages/db-main-prisma
            </code>
            , then delete the latest migration file and re-run from step 3.
          </p>
        </section>

        {/* Testing */}
        <section id="testing" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">Testing</h2>
          <Tabs defaultValue="e2e">
            <TabsList>
              <TabsTrigger value="e2e">E2E Tests</TabsTrigger>
              <TabsTrigger value="unit">Unit Tests</TabsTrigger>
            </TabsList>
            <TabsContent value="e2e" className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                E2E tests live in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  apps/nestjs-backend
                </code>{" "}
                and run against a real database.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                {`# first-time setup (seeds the test database)
pnpm pre-test-e2e

# run all E2E tests
pnpm test-e2e

# run a specific test file
pnpm test-e2e record.e2e-spec`}
              </pre>
            </TabsContent>
            <TabsContent value="unit" className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Unit tests can run in any package without a database.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                {`# run all unit tests across the monorepo
pnpm g:test-unit

# run tests in a specific package
cd packages/core
pnpm test-unit

# run a specific test file
pnpm test-unit formula.spec`}
              </pre>
            </TabsContent>
          </Tabs>
        </section>

        {/* Useful commands */}
        <section className="space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Useful Commands
          </h2>
          <div className="divide-y rounded-lg border text-sm">
            {[
              { cmd: "corepack enable", desc: "Activate pnpm via corepack" },
              {
                cmd: "pnpm install",
                desc: "Install all workspace dependencies",
              },
              {
                cmd: "make switch-db-mode",
                desc: "Start Docker DB services and apply migrations",
              },
              {
                cmd: "pnpm dev  (in apps/nestjs-backend)",
                desc: "Start backend + frontend in watch mode",
              },
              { cmd: "pnpm build:packages", desc: "Build all shared packages" },
              { cmd: "pnpm g:test-unit", desc: "Run all unit tests" },
              {
                cmd: "pnpm test-e2e  (in apps/nestjs-backend)",
                desc: "Run E2E test suite",
              },
              {
                cmd: "pnpm lint",
                desc: "ESLint + Prettier across the monorepo",
              },
              {
                cmd: "make gen-prisma-schema",
                desc: "Regenerate Prisma schema from template",
              },
              {
                cmd: "make db-migration",
                desc: "Create a new Prisma migration file",
              },
              {
                cmd: "pnpm prisma studio  (in packages/db-main-prisma)",
                desc: "Open Prisma Studio (visual DB browser)",
              },
            ].map((r) => (
              <div
                key={r.cmd}
                className="flex items-baseline gap-4 px-3 py-2.5"
              >
                <code className="min-w-0 flex-1 font-mono text-xs">
                  {r.cmd}
                </code>
                <span className="hidden w-72 shrink-0 text-xs text-muted-foreground sm:block">
                  {r.desc}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Guidelines */}
        <section id="guidelines" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Contribution Guidelines
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Open an issue first",
                desc: "For non-trivial features or breaking changes, open an issue to align on the approach before writing code.",
              },
              {
                title: "Keep PRs focused",
                desc: "One feature or fix per PR. Don't mix refactors with functional changes unless they're inseparable.",
              },
              {
                title: "Write tests",
                desc: "New backend endpoints need E2E tests. Run pnpm pre-test-e2e once to seed the test DB before running pnpm test-e2e.",
              },
              {
                title: "Run build + lint before pushing",
                code: "pnpm build && pnpm lint",
                desc: "CI will catch failures, but running locally saves round trips.",
              },
              {
                title: "Update after pulling",
                code: "pnpm install && make switch-db-mode",
                desc: "Keep dependencies and the DB schema in sync with the latest develop branch.",
              },
              {
                title: "Update docs",
                desc: "If your change adds an API endpoint, env var, or field type, update the relevant page in apps/nextjs-statics/tech-guides/.",
              },
            ].map((g) => (
              <Card key={g.title}>
                <CardHeader>
                  <CardTitle className="text-base">{g.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{g.desc}</p>
                  {"code" in g && g.code && (
                    <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                      {g.code}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Code of conduct */}
        <section id="conduct" className="scroll-mt-16 space-y-3">
          <h2 className="font-heading text-xl font-semibold">
            Code of Conduct
          </h2>
          <p className="text-sm text-muted-foreground">
            All contributors are expected to follow our{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              CODE_OF_CONDUCT.md
            </code>{" "}
            (Contributor Covenant). Be respectful, constructive, and welcoming
            to contributors of all backgrounds and experience levels.
            Harassment, discriminatory language, and personal attacks are not
            tolerated and will result in a ban.
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
            <Link href="/docs/self-hosting" className="hover:text-foreground">
              Self-Hosting
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
