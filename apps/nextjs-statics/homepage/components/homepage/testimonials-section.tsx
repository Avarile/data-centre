"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Quote } from "lucide-react"

const testimonials = [
  {
    quote:
      "Cybernetics replaced our entire Airtable setup in two weeks. The real-time collaboration is genuinely incredible — our team of 40 now works out of a single source of truth.",
    author: "Sarah K.",
    role: "Engineering Lead",
    company: "TechScale",
    initials: "SK",
    color: "bg-black",
  },
  {
    quote:
      "Finally, a database tool that developers actually want to use. The auto-generated REST API and the filtering DSL saved us months of backend work.",
    author: "Alex M.",
    role: "CTO",
    company: "DataFlow Inc.",
    initials: "AM",
    color: "bg-gray-700",
  },
  {
    quote:
      "We migrated 500+ spreadsheets from Google Sheets to Cybernetics in under a week. The import tool is flawless and the formula compatibility is a lifesaver.",
    author: "Maria L.",
    role: "Head of Data",
    company: "ScaleUp Co.",
    initials: "ML",
    color: "bg-gray-500",
  },
  {
    quote:
      "The self-hosting option was the deal-breaker for us. Full control over our data, on our infrastructure, with an interface our non-technical team actually loves.",
    author: "James W.",
    role: "VP of Operations",
    company: "CloudBase",
    initials: "JW",
    color: "bg-gray-400",
  },
]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="bg-gray-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-widest text-gray-500 uppercase">
            Customers
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Loved by data-driven teams
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Thousands of teams use Cybernetics to manage their most critical
            data.
          </p>
        </div>

        <div className="relative mt-16">
          <Carousel opts={{ align: "start", loop: true }} className="w-full">
            <CarouselContent className="-ml-4">
              {testimonials.map((t, i) => (
                <CarouselItem
                  key={i}
                  className="pl-4 md:basis-1/2 lg:basis-1/2"
                >
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                    <div>
                      <Quote className="h-8 w-8 fill-gray-200 text-gray-200" />
                      <p className="mt-4 text-base leading-relaxed text-gray-700">
                        &ldquo;{t.quote}&rdquo;
                      </p>
                    </div>
                    <div className="mt-8 flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${t.color}`}
                      >
                        {t.initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {t.author}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.role} · {t.company}
                        </p>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="mt-8 flex items-center justify-center gap-3">
              <CarouselPrevious className="static translate-y-0 rounded-full border-gray-200 hover:bg-gray-100" />
              <CarouselNext className="static translate-y-0 rounded-full border-gray-200 hover:bg-gray-100" />
            </div>
          </Carousel>
        </div>
      </div>
    </section>
  )
}
