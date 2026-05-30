"use client"

import { motion } from "motion/react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Star } from "lucide-react"

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
import { TableMockup } from "./table-mockup"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-gray-100 opacity-60 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:items-center lg:gap-16">
          <motion.div
            className="max-w-2xl flex-1"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <Badge
              variant="secondary"
              className="mb-6 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
            >
              Open Source · Database Platform
            </Badge>

            <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl lg:text-[64px] lg:leading-[1.1]">
              Build powerful databases{" "}
              <span className="text-gray-500">at team speed</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-500">
              Cybernetics combines the familiarity of spreadsheets with the
              power of a real database. Collaborate in real-time, create custom
              views, automate workflows, and scale to millions of rows.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="h-11 bg-black px-6 text-sm font-medium text-white hover:bg-gray-800"
                asChild
              >
                <Link href="/signup">
                  Get started for free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 border-gray-300 px-5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                asChild
              >
                <Link
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GithubIcon className="mr-2 h-4 w-4" />
                  <Star className="mr-1 h-3.5 w-3.5 fill-gray-400 text-gray-400" />
                  12.4k
                </Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Self-hostable
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                MIT License
              </div>
            </div>
          </motion.div>

          <motion.div
            className="w-full flex-1 lg:max-w-2xl"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          >
            <TableMockup />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
