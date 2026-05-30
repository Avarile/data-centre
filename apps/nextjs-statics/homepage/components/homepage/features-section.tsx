"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"
import {
  Users,
  LayoutGrid,
  Zap,
  Code2,
  BarChart3,
  ShieldCheck,
} from "lucide-react"

const features = [
  {
    icon: Users,
    title: "Real-time Collaboration",
    description:
      "Work simultaneously with your entire team. See changes, cursors, and edits as they happen — no refreshing needed.",
    color: "text-gray-900",
    bg: "bg-gray-100",
  },
  {
    icon: LayoutGrid,
    title: "Multiple View Types",
    description:
      "Switch between Grid, Kanban, Gallery, Calendar, and Form views. Each base can have unlimited views tailored to every workflow.",
    color: "text-gray-900",
    bg: "bg-gray-100",
  },
  {
    icon: Zap,
    title: "Powerful Formulas",
    description:
      "Use familiar Excel-like formulas with relational data support. Reference linked records, roll up values, and automate calculations.",
    color: "text-gray-900",
    bg: "bg-gray-100",
  },
  {
    icon: Code2,
    title: "API-First Design",
    description:
      "Every base has a REST API and GraphQL endpoint auto-generated. SDKs available for JavaScript, Python, Go, and more.",
    color: "text-gray-900",
    bg: "bg-gray-100",
  },
  {
    icon: BarChart3,
    title: "Charts & Analytics",
    description:
      "Visualize your data with built-in bar, line, pie, and scatter charts. Build dashboards without leaving your database.",
    color: "text-gray-900",
    bg: "bg-gray-100",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Security",
    description:
      "SSO, RBAC permissions, audit logs, and end-to-end encryption. Deploy on your own infrastructure or use our cloud.",
    color: "text-gray-900",
    bg: "bg-gray-100",
  },
]

export function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-widest text-gray-500 uppercase">
            Features
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Everything your team needs
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            A complete platform for building, collaborating, and scaling your
            data — without the complexity.
          </p>
        </div>

        <div
          ref={ref}
          className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
                className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md"
              >
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${feature.bg}`}
                >
                  <Icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  {feature.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
