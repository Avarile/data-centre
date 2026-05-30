"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X, Database } from "lucide-react"

const navLinks = [
  { label: "Why Cybernetics", href: "#why" },
  { label: "Features", href: "#features" },
  { label: "Customers", href: "#testimonials" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "#docs" },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? "border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur-sm"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-gray-900"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <Database className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg">Cybernetics</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-600 transition-colors hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            Log in
          </Link>
          <Button size="sm" className="bg-black text-white hover:bg-gray-800">
            Get started
          </Button>
        </div>

        <button
          className="flex items-center md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5 text-gray-700" />
          ) : (
            <Menu className="h-5 w-5 text-gray-700" />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-700 hover:text-black"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-3">
              <Link href="/login" className="text-sm text-gray-700">
                Log in
              </Link>
              <Button
                size="sm"
                className="w-full bg-black text-white hover:bg-gray-800"
              >
                Get started
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
