import Link from "next/link"
import { Database } from "lucide-react"

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

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.635zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
import { Button } from "@/components/ui/button"

const links = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Templates", href: "#templates" },
    { label: "Changelog", href: "#changelog" },
    { label: "Roadmap", href: "#roadmap" },
  ],
  Resources: [
    { label: "Documentation", href: "#docs" },
    { label: "API Reference", href: "#api" },
    { label: "Blog", href: "#blog" },
    { label: "Community", href: "#community" },
    { label: "Status", href: "#status" },
  ],
  Company: [
    { label: "About", href: "#about" },
    { label: "Customers", href: "#testimonials" },
    { label: "Open Source", href: "https://github.com" },
    { label: "GitHub", href: "https://github.com" },
    { label: "Discord", href: "#discord" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#privacy" },
    { label: "Terms of Service", href: "#terms" },
    { label: "Cookie Policy", href: "#cookies" },
    { label: "Security", href: "#security" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          <div className="shrink-0 lg:w-64">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-gray-900"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
                <Database className="h-4 w-4 text-white" />
              </div>
              <span>Cybernetics</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-gray-500">
              The open source database platform built for teams who want the
              power of SQL with the simplicity of a spreadsheet.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 border-gray-200 p-0 text-gray-600 hover:bg-gray-50"
                asChild
              >
                <Link
                  href="https://github.com"
                  target="_blank"
                  aria-label="GitHub"
                >
                  <GithubIcon className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 border-gray-200 p-0 text-gray-600 hover:bg-gray-50"
                asChild
              >
                <Link
                  href="https://twitter.com"
                  target="_blank"
                  aria-label="Twitter / X"
                >
                  <XIcon className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-4">
            {Object.entries(links).map(([section, items]) => (
              <div key={section}>
                <h3 className="text-xs font-semibold tracking-widest text-gray-900 uppercase">
                  {section}
                </h3>
                <ul className="mt-4 space-y-3">
                  {items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="text-sm text-gray-500 transition-colors hover:text-gray-900"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} Cybernetics. Open source under the MIT
            License.
          </p>
          <p className="text-xs text-gray-400">
            Built with ❤️ by the open source community
          </p>
        </div>
      </div>
    </footer>
  )
}
