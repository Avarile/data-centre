import Link from "next/link"
import { ChevronRight, Database, Shield, Webhook, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

function MethodBadge({ method }: { method: string }) {
  const color: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
    PUT: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  }
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${color[method] ?? "bg-muted text-muted-foreground"}`}
    >
      {method}
    </span>
  )
}

const sections: {
  id: string
  title: string
  description: string
  endpoints: { method: string; path: string; desc: string }[]
}[] = [
  {
    id: "spaces",
    title: "Spaces",
    description:
      "Top-level workspace containers. A space holds multiple bases.",
    endpoints: [
      { method: "GET", path: "/api/space", desc: "List all spaces" },
      { method: "POST", path: "/api/space", desc: "Create a space" },
      { method: "GET", path: "/api/space/:spaceId", desc: "Get a space" },
      { method: "PATCH", path: "/api/space/:spaceId", desc: "Update a space" },
      { method: "DELETE", path: "/api/space/:spaceId", desc: "Delete a space" },
      {
        method: "GET",
        path: "/api/space/:spaceId/base",
        desc: "List bases in a space",
      },
      {
        method: "GET",
        path: "/api/space/:spaceId/search",
        desc: "Search within a space",
      },
    ],
  },
  {
    id: "bases",
    title: "Bases",
    description:
      "Database applications within a space. Each base contains tables.",
    endpoints: [
      { method: "POST", path: "/api/base", desc: "Create a base" },
      { method: "GET", path: "/api/base/:baseId", desc: "Get a base" },
      { method: "PATCH", path: "/api/base/:baseId", desc: "Update a base" },
      { method: "DELETE", path: "/api/base/:baseId", desc: "Delete a base" },
      { method: "POST", path: "/api/base/duplicate", desc: "Duplicate a base" },
      {
        method: "POST",
        path: "/api/base/:baseId/connection",
        desc: "Get connection info",
      },
      {
        method: "GET",
        path: "/api/base/:baseId/collaborators",
        desc: "List collaborators",
      },
    ],
  },
  {
    id: "tables",
    title: "Tables",
    description:
      "Schema containers within a base. Tables hold fields and records.",
    endpoints: [
      { method: "GET", path: "/api/base/:baseId/table", desc: "List tables" },
      {
        method: "POST",
        path: "/api/base/:baseId/table",
        desc: "Create a table",
      },
      {
        method: "GET",
        path: "/api/base/:baseId/table/:tableId",
        desc: "Get a table",
      },
      {
        method: "PUT",
        path: "/api/base/:baseId/table/:tableId/name",
        desc: "Rename a table",
      },
      {
        method: "POST",
        path: "/api/base/:baseId/table/:tableId/duplicate",
        desc: "Duplicate a table",
      },
      {
        method: "DELETE",
        path: "/api/base/:baseId/table/:tableId",
        desc: "Delete a table",
      },
    ],
  },
  {
    id: "fields",
    title: "Fields",
    description:
      "Column definitions for a table. Supported types: singleLineText, longText, number, currency, percent, date, dateTime, checkbox, multipleSelect, singleSelect, user, link, attachment, formula, rollup, count, rating.",
    endpoints: [
      { method: "GET", path: "/api/table/:tableId/field", desc: "List fields" },
      {
        method: "POST",
        path: "/api/table/:tableId/field",
        desc: "Create a field",
      },
      {
        method: "GET",
        path: "/api/table/:tableId/field/:fieldId",
        desc: "Get a field",
      },
      {
        method: "PATCH",
        path: "/api/table/:tableId/field/:fieldId",
        desc: "Update a field",
      },
      {
        method: "PUT",
        path: "/api/table/:tableId/field/:fieldId/convert",
        desc: "Convert field type",
      },
      {
        method: "DELETE",
        path: "/api/table/:tableId/field/:fieldId",
        desc: "Delete a field",
      },
    ],
  },
  {
    id: "records",
    title: "Records",
    description:
      "Row data within a table. Supports filtering, sorting, grouping, and pagination.",
    endpoints: [
      {
        method: "GET",
        path: "/api/table/:tableId/record",
        desc: "List records",
      },
      {
        method: "POST",
        path: "/api/table/:tableId/record",
        desc: "Create records",
      },
      {
        method: "GET",
        path: "/api/table/:tableId/record/:recordId",
        desc: "Get a record",
      },
      {
        method: "PATCH",
        path: "/api/table/:tableId/record/:recordId",
        desc: "Update a record",
      },
      {
        method: "DELETE",
        path: "/api/table/:tableId/record/:recordId",
        desc: "Delete a record",
      },
      {
        method: "POST",
        path: "/api/table/:tableId/record/:recordId/duplicate",
        desc: "Duplicate a record",
      },
      {
        method: "GET",
        path: "/api/table/:tableId/record/:recordId/history",
        desc: "Record change history",
      },
      {
        method: "POST",
        path: "/api/table/:tableId/record/form-submit",
        desc: "Submit form data",
      },
    ],
  },
  {
    id: "views",
    title: "Views",
    description:
      "Different presentations of a table's data. Types: Grid, Form, Kanban, Gallery, Calendar.",
    endpoints: [
      { method: "GET", path: "/api/table/:tableId/view", desc: "List views" },
      {
        method: "POST",
        path: "/api/table/:tableId/view",
        desc: "Create a view",
      },
      {
        method: "GET",
        path: "/api/table/:tableId/view/:viewId",
        desc: "Get a view",
      },
      {
        method: "PUT",
        path: "/api/table/:tableId/view/:viewId/filter",
        desc: "Update view filter",
      },
      {
        method: "PUT",
        path: "/api/table/:tableId/view/:viewId/sort",
        desc: "Update view sort",
      },
      {
        method: "PUT",
        path: "/api/table/:tableId/view/:viewId/group",
        desc: "Update view grouping",
      },
      {
        method: "POST",
        path: "/api/table/:tableId/view/:viewId/enable-share",
        desc: "Enable public share",
      },
      {
        method: "DELETE",
        path: "/api/table/:tableId/view/:viewId",
        desc: "Delete a view",
      },
    ],
  },
  {
    id: "ai",
    title: "AI",
    description:
      "LLM integrations per base. Supports OpenAI, Gemini, Claude, Azure, Mistral, Ollama, and more.",
    endpoints: [
      {
        method: "GET",
        path: "/api/:baseId/ai/config",
        desc: "Get AI config for a base",
      },
      {
        method: "POST",
        path: "/api/:baseId/ai/generate-stream",
        desc: "Streaming text generation",
      },
      {
        method: "POST",
        path: "/api/:baseId/ai/tts",
        desc: "Text-to-speech (ElevenLabs)",
      },
      {
        method: "POST",
        path: "/api/:baseId/ai/ingest-stream",
        desc: "Ingest knowledge stream",
      },
    ],
  },
  {
    id: "attachments",
    title: "Attachments",
    description: "File uploads stored locally, on S3, or MinIO.",
    endpoints: [
      {
        method: "POST",
        path: "/api/attachments/signature",
        desc: "Get upload signature",
      },
      {
        method: "PUT",
        path: "/api/attachments/upload/:token",
        desc: "Upload a file",
      },
      {
        method: "GET",
        path: "/api/attachments/read/:path",
        desc: "Read / download a file",
      },
    ],
  },
]

export default function ApiDocsPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3 text-sm text-muted-foreground">
          <Database className="size-4" />
          <Link href="/" className="font-heading font-semibold text-foreground">
            Cybernetics
          </Link>
          <ChevronRight className="size-3" />
          <span>API Reference</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
        <section className="space-y-3">
          <Badge variant="secondary">REST API</Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            API Reference
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            The Cybernetics REST API is organized around spaces, bases, tables,
            fields, records, and views. All requests require an{" "}
            <a
              href="#auth"
              className="underline underline-offset-2 hover:text-foreground"
            >
              access token
            </a>
            .
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
            {`GET https://your-domain.com/api/space\nAuthorization: Bearer <your-access-token>`}
          </pre>
        </section>

        {/* Auth */}
        <section id="auth" className="scroll-mt-16 space-y-5">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <Shield className="size-5 text-muted-foreground" />
            Authentication
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Personal Access Token
                  <Badge variant="outline">Recommended</Badge>
                </CardTitle>
                <CardDescription>
                  Generate in <strong>Settings → Access Tokens</strong>. Scope
                  tokens to specific spaces.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                  {`Authorization: Bearer <your-token>`}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">OAuth 2.0</CardTitle>
                <CardDescription>
                  Authorization Code flow for apps acting on behalf of users.
                  Supports GitHub, Google, and custom OIDC.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Register your app under <strong>Settings → OAuth Apps</strong>
                  .
                </p>
                <div className="divide-y rounded-lg border font-mono text-xs">
                  {[
                    "GET  /api/auth/oauth2/authorize",
                    "POST /api/auth/oauth2/token",
                    "POST /api/auth/oauth2/revoke",
                  ].map((r) => (
                    <div key={r} className="px-3 py-1.5">
                      {r}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Endpoint Sections */}
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-16 space-y-4">
            <div>
              <h2 className="font-heading text-xl font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.description}
              </p>
            </div>
            <div className="divide-y rounded-lg border">
              {s.endpoints.map((ep) => (
                <div
                  key={`${ep.method}-${ep.path}`}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <MethodBadge method={ep.method} />
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {ep.path}
                  </code>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {ep.desc}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <Separator />

        {/* Webhooks */}
        <section id="webhooks" className="scroll-mt-16 space-y-5">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <Webhook className="size-5 text-muted-foreground" />
            Webhooks
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure webhooks per table to receive real-time event
            notifications. Payloads are sent as JSON POST requests.
          </p>
          <div className="divide-y rounded-lg border">
            {[
              {
                event: "record.created",
                desc: "A record is created in the table",
              },
              { event: "record.updated", desc: "A record field value changes" },
              {
                event: "record.deleted",
                desc: "A record is deleted or archived",
              },
            ].map((w) => (
              <div key={w.event} className="flex items-start gap-3 px-3 py-2.5">
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {w.event}
                </code>
                <span className="text-sm text-muted-foreground">{w.desc}</span>
              </div>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payload example</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                {`{
  "event": "record.created",
  "tableId": "tbl_xxxxxxxx",
  "baseId": "bas_xxxxxxxx",
  "record": {
    "id": "rec_xxxxxxxx",
    "fields": { "Name": "Acme Corp", "Status": "Active" },
    "createdTime": "2025-01-01T00:00:00.000Z"
  }
}`}
              </pre>
            </CardContent>
          </Card>
        </section>

        {/* Rate limits */}
        <section id="rate-limits" className="scroll-mt-16 space-y-5">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <Zap className="size-5 text-muted-foreground" />
            Rate Limits &amp; Errors
          </h2>
          <div className="divide-y rounded-lg border text-sm">
            {[
              { code: "400", text: "Bad Request — invalid parameters" },
              { code: "401", text: "Unauthorized — missing or invalid token" },
              { code: "403", text: "Forbidden — insufficient permissions" },
              { code: "404", text: "Not Found — resource does not exist" },
              { code: "429", text: "Too Many Requests — rate limit exceeded" },
              { code: "500", text: "Internal Server Error" },
            ].map((e) => (
              <div key={e.code} className="flex items-center gap-3 px-3 py-2.5">
                <code className="w-10 shrink-0 font-mono text-xs font-semibold">
                  {e.code}
                </code>
                <span className="text-muted-foreground">{e.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 pb-8">
          <Separator />
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              ← Back to Support
            </Link>
            <Link href="/docs/plugins" className="hover:text-foreground">
              Plugin Development
            </Link>
            <Link href="/docs/self-hosting" className="hover:text-foreground">
              Self-Hosting
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
