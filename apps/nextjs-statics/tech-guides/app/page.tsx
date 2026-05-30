import Link from "next/link"
import {
  BookOpen,
  Code2,
  Server,
  GitBranch,
  Key,
  Webhook,
  Zap,
  Shield,
  Globe,
  Box,
  ChevronRight,
  Database,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const pathways = [
  {
    icon: Code2,
    title: "API",
    badge: "Integrate",
    description:
      "REST APIs for spaces, bases, tables, fields, records, and views. Auto-generated endpoints for every schema.",
    links: [
      { label: "REST API overview", href: "/docs/api" },
      { label: "Authentication & access tokens", href: "/docs/api#auth" },
      { label: "Webhooks", href: "/docs/api#webhooks" },
    ],
  },
  {
    icon: Box,
    title: "Plugins",
    badge: "Extend",
    description:
      "Build custom plugins with the Cybernetics SDK — add UI panels, context menus, and server-side logic.",
    links: [
      { label: "Getting started with Plugins", href: "/docs/plugins" },
      { label: "Plugin SDK reference", href: "/docs/plugins#sdk" },
      { label: "Publish a plugin", href: "/docs/plugins#publish" },
    ],
  },
  {
    icon: Server,
    title: "Self-Host",
    badge: "Deploy",
    description:
      "Run Cybernetics on your own infrastructure with full data control. Supports Docker, AWS, GCP, and Azure.",
    links: [
      { label: "Docker Compose (quick start)", href: "/docs/self-hosting" },
      { label: "Environment variables", href: "/docs/self-hosting#env" },
      { label: "Upgrade guide", href: "/docs/self-hosting#upgrade" },
    ],
  },
  {
    icon: GitBranch,
    title: "Contribute",
    badge: "Open Source",
    description:
      "Set up the monorepo locally, follow contribution guidelines, and submit pull requests.",
    links: [
      { label: "Local setup", href: "/docs/contributing" },
      {
        label: "Contribution guidelines",
        href: "/docs/contributing#guidelines",
      },
      { label: "Code of conduct", href: "/docs/contributing#conduct" },
    ],
  },
]

const apiEndpoints = [
  { method: "GET", path: "/api/space", desc: "List all spaces" },
  { method: "POST", path: "/api/space", desc: "Create a space" },
  {
    method: "GET",
    path: "/api/base/:baseId/table",
    desc: "List tables in a base",
  },
  { method: "POST", path: "/api/base/:baseId/table", desc: "Create a table" },
  { method: "GET", path: "/api/table/:tableId/record", desc: "List records" },
  {
    method: "POST",
    path: "/api/table/:tableId/record",
    desc: "Create records",
  },
  {
    method: "GET",
    path: "/api/table/:tableId/field",
    desc: "List fields / columns",
  },
  { method: "GET", path: "/api/table/:tableId/view", desc: "List views" },
]

const faqs = [
  {
    q: "How do I authenticate with the Cybernetics API?",
    a: "Generate a Personal Access Token in Settings → Access Tokens. Pass it as a Bearer token in every request: Authorization: Bearer <your-token>. Tokens can be scoped to limit access to specific spaces.",
  },
  {
    q: "What is the API rate limit?",
    a: "Requests are rate-limited per workspace. Exceeding the limit returns a 429 Too Many Requests response. Use batch record operations to stay within limits when importing or syncing large datasets.",
  },
  {
    q: "How do I create a custom field?",
    a: "POST to /api/table/:tableId/field with the field type and configuration. Supported types include: singleLineText, longText, number, currency, percent, date, dateTime, checkbox, multipleSelect, singleSelect, user, link, attachment, formula, rollup, count, and rating.",
  },
  {
    q: "What view types are supported?",
    a: "Cybernetics supports Grid, Form, Kanban, Gallery, and Calendar views. Each view can have its own filters, sorts, groupings, and hidden fields. Create views via POST /api/table/:tableId/view.",
  },
  {
    q: "How do I run Cybernetics locally?",
    a: "Clone the monorepo, install dependencies with pnpm, copy .env.example to .env and fill in the required values (PostgreSQL URL, Redis URL, etc.), then start the backend and frontend. Full steps are in the Contributing guide.",
  },
  {
    q: "Does Cybernetics support webhooks?",
    a: "Yes. Webhooks fire on record events (created, updated, deleted) for any table. Payloads are sent as JSON POST requests to your configured endpoint.",
  },
  {
    q: "Which AI providers are supported?",
    a: "The AI module supports OpenAI, Google Gemini, Anthropic Claude, Azure AI, Cohere, Mistral, DeepSeek, Together AI, XAI, Amazon Bedrock, OpenRouter, and Ollama. Each provider can be configured per base in AI settings.",
  },
]

function MethodBadge({ method }: { method: string }) {
  const color: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
  }
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${color[method] ?? "bg-muted text-muted-foreground"}`}
    >
      {method}
    </span>
  )
}

export default function TechSupportPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            <span className="font-heading text-base font-semibold">
              Cybernetics
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              Developer Support
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/docs/api">
                <BookOpen className="size-4" />
                API Docs
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/docs/contributing">
                <GitBranch className="size-4" />
                Contribute
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
        {/* Hero */}
        <section className="space-y-4 text-center">
          <Badge variant="secondary" className="mb-2">
            Developer Reference
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Cybernetics Developer Support
          </h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground">
            Everything you need to build on, integrate with, and self-host the
            Cybernetics open-source database platform.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button asChild>
              <Link href="/docs/api">Browse all docs</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/docs/contributing">Contribute</Link>
            </Button>
          </div>
        </section>

        {/* Pathways */}
        <section className="space-y-5">
          <h2 className="font-heading text-xl font-semibold">
            Development Pathways
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pathways.map((p) => {
              const Icon = p.icon
              return (
                <Card
                  key={p.title}
                  className="group/card transition-shadow hover:shadow-md"
                >
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <CardTitle>{p.title}</CardTitle>
                      <Badge variant="secondary" className="ml-auto">
                        {p.badge}
                      </Badge>
                    </div>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {p.links.map((l) => (
                        <li key={l.label}>
                          <Link
                            href={l.href}
                            className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="size-3 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
                            {l.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* Quick Reference */}
        <section className="space-y-5">
          <h2 className="font-heading text-xl font-semibold">
            Quick Reference
          </h2>
          <Tabs defaultValue="endpoints">
            <TabsList>
              <TabsTrigger value="endpoints">
                <Globe className="size-3.5" />
                Endpoints
              </TabsTrigger>
              <TabsTrigger value="auth">
                <Key className="size-3.5" />
                Auth
              </TabsTrigger>
              <TabsTrigger value="limits">
                <Zap className="size-3.5" />
                Rate Limits
              </TabsTrigger>
              <TabsTrigger value="webhooks">
                <Webhook className="size-3.5" />
                Webhooks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints" className="mt-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Base URL:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      https://your-domain.com
                    </code>{" "}
                    — or your self-hosted domain.
                  </p>
                  <div className="divide-y rounded-lg border">
                    {apiEndpoints.map((ep) => (
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
                  <div className="mt-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/docs/api">Full API reference</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="auth" className="mt-3">
              <Card>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Personal Access Token
                      </span>
                      <Badge variant="outline">Recommended</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Generate tokens in{" "}
                      <strong>Settings → Access Tokens</strong>. Pass in every
                      request header:
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs">
                      {`Authorization: Bearer <your-access-token>`}
                    </pre>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <span className="text-sm font-medium">OAuth 2.0</span>
                    <p className="text-sm text-muted-foreground">
                      For external apps acting on behalf of users — register
                      your app under <strong>Settings → OAuth Apps</strong> and
                      follow the Authorization Code flow. Supports GitHub,
                      Google, and custom OIDC providers.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="mt-2"
                    >
                      <Link href="/docs/api#auth">Auth guide</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="limits" className="mt-3">
              <Card>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Rows supported",
                        value: "50M+",
                        note: "Per table",
                      },
                      {
                        label: "On limit exceeded",
                        value: "429",
                        note: "Too Many Requests",
                      },
                      {
                        label: "Real-time sync",
                        value: "WS",
                        note: "WebSocket + ShareDB",
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="space-y-0.5 rounded-lg border p-3"
                      >
                        <p className="font-heading text-2xl font-semibold">
                          {stat.value}
                        </p>
                        <p className="text-xs font-medium">{stat.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {stat.note}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use batch record creation and update endpoints to minimize
                    request count when syncing large datasets.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhooks" className="mt-3">
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Configure webhooks per table. Each webhook fires a JSON POST
                    to your endpoint for the subscribed event.
                  </p>
                  <div className="divide-y rounded-lg border">
                    {[
                      {
                        event: "record.created",
                        desc: "A record is created in the table",
                      },
                      {
                        event: "record.updated",
                        desc: "A record field value changes",
                      },
                      {
                        event: "record.deleted",
                        desc: "A record is deleted or archived",
                      },
                    ].map((w) => (
                      <div
                        key={w.event}
                        className="flex items-start gap-3 px-3 py-2.5"
                      >
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {w.event}
                        </code>
                        <span className="text-sm text-muted-foreground">
                          {w.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/docs/api#webhooks">Webhook docs</Link>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* FAQ */}
        <section className="space-y-5">
          <h2 className="font-heading text-xl font-semibold">
            Common Questions
          </h2>
          <Accordion type="single" collapsible className="rounded-xl border">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="px-4">
                <AccordionTrigger className="py-3 font-medium">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground">{faq.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Footer links */}
        <section className="space-y-4 pb-8">
          <Separator />
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {[
              { label: "API Reference", href: "/docs/api" },
              { label: "Plugin Development", href: "/docs/plugins" },
              { label: "Self-Hosting", href: "/docs/self-hosting" },
              { label: "Contributing", href: "/docs/contributing" },
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
