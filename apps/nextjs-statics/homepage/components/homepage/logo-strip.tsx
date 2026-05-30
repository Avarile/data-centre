const companies = [
  "Acme Corp",
  "TechScale",
  "DataFlow",
  "CloudBase",
  "NovaTech",
  "BuildCo",
  "GridSync",
  "PulseCRM",
  "LoopLabs",
  "SkyData",
]

export function LogoStrip() {
  const doubled = [...companies, ...companies]

  return (
    <section className="border-y border-gray-100 bg-gray-50/50 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-8 text-center text-xs font-medium tracking-widest text-gray-400 uppercase">
          Trusted by teams at
        </p>
      </div>

      <div className="relative overflow-hidden">
        <div className="animate-marquee flex gap-12 whitespace-nowrap">
          {doubled.map((name, i) => (
            <div
              key={i}
              className="inline-flex items-center text-sm font-semibold tracking-tight text-gray-400 select-none"
            >
              {name}
              {i < doubled.length - 1 && (
                <span className="ml-12 inline-block h-1 w-1 rounded-full bg-gray-300" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
