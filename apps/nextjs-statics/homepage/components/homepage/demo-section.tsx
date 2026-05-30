import { CheckCircle2 } from "lucide-react"

const highlights = [
  "Drag-and-drop field reordering and column resizing",
  "Inline editing with keyboard navigation support",
  "Linked records across bases for relational data",
  "Conditional formatting and row coloring",
  "Bulk actions: delete, update, and export",
  "Import from CSV, Excel, Airtable, and Notion",
]

const viewTabs = ["Grid", "Kanban", "Gallery", "Calendar", "Form"]

export function DemoSection() {
  return (
    <section className="bg-gray-950 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
          <div className="shrink-0 lg:w-[420px]">
            <p className="text-sm font-semibold tracking-widest text-gray-400 uppercase">
              The Interface
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Familiar. Powerful. Fast.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-400">
              Cybernetics feels like a spreadsheet on day one, but scales like a
              database as your team grows. No migration pain, no learning curve.
            </p>
            <ul className="mt-8 space-y-3">
              {highlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-gray-300"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 overflow-hidden rounded-2xl border border-gray-800 shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-gray-800 bg-gray-900 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-gray-700" />
              <div className="h-3 w-3 rounded-full bg-gray-700" />
              <div className="h-3 w-3 rounded-full bg-gray-700" />
              <span className="ml-3 text-xs font-medium text-gray-500">
                Customer Database · Cybernetics
              </span>
            </div>

            <div className="flex gap-0 border-b border-gray-800 bg-gray-900 px-4">
              {viewTabs.map((tab, i) => (
                <button
                  key={tab}
                  className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                    i === 0
                      ? "border-white text-white"
                      : "border-transparent text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="bg-gray-950">
              <div className="grid grid-cols-6 border-b border-gray-800 px-4 py-2.5 text-xs font-medium text-gray-500">
                <div className="col-span-2">Company</div>
                <div>Industry</div>
                <div>Stage</div>
                <div>MRR</div>
                <div>Owner</div>
              </div>

              {[
                {
                  name: "Anthropic",
                  industry: "AI/ML",
                  stage: "Series C",
                  mrr: "$240k",
                  owner: "Sarah",
                },
                {
                  name: "Vercel",
                  industry: "DevTools",
                  stage: "Series D",
                  mrr: "$380k",
                  owner: "Alex",
                },
                {
                  name: "Linear",
                  industry: "Productivity",
                  stage: "Series B",
                  mrr: "$120k",
                  owner: "Maria",
                },
                {
                  name: "Raycast",
                  industry: "Productivity",
                  stage: "Series A",
                  mrr: "$85k",
                  owner: "James",
                },
                {
                  name: "Resend",
                  industry: "Email API",
                  stage: "Seed",
                  mrr: "$42k",
                  owner: "Kim",
                },
                {
                  name: "Neon",
                  industry: "Database",
                  stage: "Series B",
                  mrr: "$160k",
                  owner: "David",
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-6 items-center border-b border-gray-900 px-4 py-2.5 text-xs text-gray-400 transition-colors hover:bg-gray-900/50"
                >
                  <div className="col-span-2 font-medium text-gray-200">
                    {row.name}
                  </div>
                  <div>{row.industry}</div>
                  <div>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-300">
                      {row.stage}
                    </span>
                  </div>
                  <div className="font-medium text-white">{row.mrr}</div>
                  <div>{row.owner}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
