import Link from "next/link"
import { Box, ChevronRight, Database } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function PluginsDocsPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3 text-sm text-muted-foreground">
          <Database className="size-4" />
          <Link href="/" className="font-heading font-semibold text-foreground">
            Cybernetics
          </Link>
          <ChevronRight className="size-3" />
          <span>Plugin Development</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
        <section className="space-y-3">
          <Badge variant="secondary">Extend</Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Plugin Development
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Build custom plugins to extend Cybernetics with UI panels, context
            menus, dashboards, and server-side logic using the official Plugin
            SDK.
          </p>
        </section>

        {/* Overview */}
        <section id="overview" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">Overview</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Box,
                title: "UI Panels",
                desc: "Render custom views inside any table or record — charts, maps, calendars, or any iframe-based UI.",
              },
              {
                icon: Box,
                title: "Context Menus",
                desc: "Add actions to right-click menus on records, cells, or fields for quick custom workflows.",
              },
              {
                icon: Box,
                title: "Dashboards",
                desc: "Build analytics widgets that plug directly into Cybernetics base dashboards.",
              },
            ].map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <CardTitle className="text-base">{f.title}</CardTitle>
                  <CardDescription>{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* SDK */}
        <section id="sdk" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">Plugin SDK</h2>
          <p className="text-sm text-muted-foreground">
            The SDK ships as a TypeScript package inside the monorepo under{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              packages/sdk
            </code>
            . It exposes hooks and utilities for reading table data, triggering
            actions, and communicating with the host app.
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Install</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                {`pnpm add @cybernetics/sdk`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Minimal plugin entry</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                {`import { definePlugin } from '@cybernetics/sdk'

export default definePlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',

  panels: [
    {
      id: 'main',
      name: 'My Panel',
      render: (ctx) => {
        // ctx.tableId, ctx.baseId, ctx.records, ctx.fields
        return '<div>Hello from My Plugin</div>'
      },
    },
  ],
})`}
              </pre>
            </CardContent>
          </Card>

          <h3 className="mt-6 font-heading text-base font-semibold">
            SDK Context API
          </h3>
          <div className="divide-y rounded-lg border text-sm">
            {[
              { name: "ctx.tableId", type: "string", desc: "Current table ID" },
              { name: "ctx.baseId", type: "string", desc: "Current base ID" },
              {
                name: "ctx.records",
                type: "Record[]",
                desc: "Records visible in the current view",
              },
              {
                name: "ctx.fields",
                type: "Field[]",
                desc: "Fields on the current table",
              },
              {
                name: "ctx.view",
                type: "View",
                desc: "Active view (type, filter, sort)",
              },
              {
                name: "ctx.selection",
                type: "string[]",
                desc: "Selected record IDs",
              },
              {
                name: "ctx.token",
                type: "string",
                desc: "OAuth token for API calls",
              },
            ].map((r) => (
              <div
                key={r.name}
                className="flex items-baseline gap-3 px-3 py-2.5"
              >
                <code className="w-40 shrink-0 font-mono text-xs">
                  {r.name}
                </code>
                <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                  {r.type}
                </code>
                <span className="text-xs text-muted-foreground">{r.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Plugin registration API */}
        <section id="api" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Plugin Management API
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage plugins programmatically via the REST API.
          </p>
          <div className="divide-y rounded-lg border text-sm">
            {[
              {
                method: "GET",
                path: "/api/plugin",
                desc: "List all available plugins",
              },
              {
                method: "POST",
                path: "/api/plugin",
                desc: "Register a new plugin",
              },
              {
                method: "GET",
                path: "/api/plugin/:pluginId",
                desc: "Get plugin details",
              },
              {
                method: "PUT",
                path: "/api/plugin/:pluginId",
                desc: "Update plugin metadata",
              },
              {
                method: "DELETE",
                path: "/api/plugin/:pluginId",
                desc: "Remove a plugin",
              },
              {
                method: "POST",
                path: "/api/plugin/:pluginId/token",
                desc: "Generate plugin access token",
              },
              {
                method: "POST",
                path: "/api/plugin/:pluginId/regenerate-secret",
                desc: "Rotate plugin secret",
              },
              {
                method: "POST",
                path: "/api/plugin/center/list",
                desc: "Browse plugin center",
              },
              {
                method: "PATCH",
                path: "/api/plugin/:pluginId/submit",
                desc: "Submit plugin for review",
              },
            ].map((ep) => {
              const color: Record<string, string> = {
                GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
                PUT: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
              }
              return (
                <div
                  key={`${ep.method}-${ep.path}`}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${color[ep.method] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {ep.method}
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {ep.path}
                  </code>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {ep.desc}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Publish */}
        <section id="publish" className="scroll-mt-16 space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Publishing a Plugin
          </h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              "Register your plugin via POST /api/plugin with name, description, and entry URL.",
              "Set your plugin's logo and screenshots in plugin metadata.",
              "Run your plugin against the sandbox environment and verify behaviour.",
              "Submit for review via PATCH /api/plugin/:pluginId/submit.",
              "Once approved, it becomes available in the Plugin Center for all users.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
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
