"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const faqs = [
  {
    q: "Is Cybernetics free to use?",
    a: "Yes. Cybernetics is open source under the MIT license and free to self-host with no row limits or feature gates. Our cloud offering has a generous free tier for small teams, with paid plans for advanced features like SSO, audit logs, and priority support.",
  },
  {
    q: "How does Cybernetics compare to Airtable or Notion?",
    a: "Cybernetics is built database-first: it handles millions of rows without slowing down, supports real SQL-level filtering, and exposes a fully documented REST API for every base automatically. Unlike Airtable, you can self-host and own your data entirely.",
  },
  {
    q: "Can I self-host Cybernetics?",
    a: "Absolutely. Cybernetics ships as a single Docker image. You can run it on any VPS, Kubernetes cluster, or bare-metal server. The self-hosted version is feature-complete — nothing is paywalled behind our cloud offering.",
  },
  {
    q: "What programming languages does the API support?",
    a: "Every base generates a REST API and a GraphQL endpoint automatically. We publish official SDKs for JavaScript/TypeScript, Python, and Go. The API follows OpenAPI 3.0, so any HTTP client in any language works out of the box.",
  },
  {
    q: "How many rows can a table hold?",
    a: "Cybernetics is built on PostgreSQL and has been tested with tables of 50+ million rows. Performance is fast even at that scale thanks to server-side pagination, indexed filtering, and virtual rendering on the frontend.",
  },
  {
    q: "Can I migrate from Airtable, Notion, or Excel?",
    a: "Yes. Cybernetics has built-in importers for CSV, Excel, Airtable (via API key), Notion (database exports), and Google Sheets. Field types, linked records, and attachments are all preserved during migration.",
  },
]

export function FAQSection() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-16 lg:flex-row lg:gap-24">
          <div className="shrink-0 lg:w-72">
            <p className="text-sm font-semibold tracking-widest text-gray-500 uppercase">
              FAQ
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
              Common questions
            </h2>
            <p className="mt-4 text-base text-gray-500">
              Can&apos;t find your answer here?{" "}
              <Link
                href="#docs"
                className="text-gray-900 underline underline-offset-2 hover:text-black"
              >
                Check the docs
              </Link>{" "}
              or reach out to our community.
            </p>
            <Button
              className="mt-6 border-gray-300 text-gray-700 hover:bg-gray-50"
              variant="outline"
              asChild
            >
              <Link href="#docs">Browse documentation →</Link>
            </Button>
          </div>

          <div className="flex-1">
            <Accordion type="single" collapsible className="w-full space-y-2">
              {faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="rounded-xl border border-gray-200 px-6 shadow-none transition-colors data-[state=open]:border-gray-300 data-[state=open]:bg-gray-50"
                >
                  <AccordionTrigger className="py-5 text-left text-sm font-semibold text-gray-900 hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-relaxed text-gray-600">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  )
}
