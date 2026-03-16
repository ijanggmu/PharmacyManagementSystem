import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Pill,
  Shield,
  Users,
  BarChart3,
  ArrowRight,
  Sparkles,
  FileCheck,
  Lock,
  HeadphonesIcon,
  Plug,
  ClipboardList,
  Truck,
  CheckCircle2,
  Quote,
} from "lucide-react"
import Link from "next/link"
import { PricingSection } from "@/components/landing/pricing-section"

export default async function HomePage() {
  return (
    <div className="min-h-screen bg-[#f8fafb] text-slate-900">
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md"
        role="banner"
      >
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            aria-label="PharmaCare home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-lg shadow-teal-600/20">
              <Pill className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-slate-900">
              PharmaCare
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Main navigation">
            <a
              href="#pricing"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:block"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:block"
            >
              FAQ
            </a>
            <Button variant="ghost" asChild className="text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button asChild className="bg-teal-600 font-semibold text-white shadow-md hover:bg-teal-700 focus-visible:ring-teal-500">
              <Link href="/onboarding">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/50 to-[#f8fafb] py-20 md:py-28"
        aria-labelledby="hero-heading"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p
              id="hero-badge"
              className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-800"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Pharmacy management, simplified
            </p>
            <h1
              id="hero-heading"
              className="font-display text-4xl font-bold leading-[1.15] tracking-tight text-slate-900 sm:text-5xl md:text-6xl"
            >
              One system for{" "}
              <span className="text-teal-600">inventory, sales & prescriptions</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
              Run your pharmacy with less hassle. Track stock, manage prescriptions, and serve
              customers from a single, secure dashboard. Built for compliance and scale.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                asChild
                className="h-12 bg-teal-600 px-6 text-base font-semibold shadow-lg hover:bg-teal-700 focus-visible:ring-teal-500"
              >
                <Link href="/onboarding">
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 border-slate-300 px-6 text-base hover:bg-slate-50 focus-visible:ring-teal-500"
              >
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        className="border-b border-slate-200/80 bg-white py-20 md:py-24"
        aria-labelledby="features-heading"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="features-heading"
              className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              Everything you need
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Features built for modern pharmacy operations and compliance.
            </p>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Pill,
                title: "Inventory",
                description:
                  "Track stock levels, set reorder points, and get expiry alerts. Barcode support and batch tracking keep your shelves accurate.",
                color: "bg-teal-100 text-teal-600",
              },
              {
                icon: Shield,
                title: "Prescriptions",
                description:
                  "Safe handling and verification built in. Manage prescribed vs dispensed quantities and maintain a clear audit trail.",
                color: "bg-emerald-100 text-emerald-600",
              },
              {
                icon: Users,
                title: "Customers",
                description:
                  "Customer records, purchase history, and optional insurance details. Link prescriptions and sales for a full view.",
                color: "bg-indigo-100 text-indigo-600",
              },
              {
                icon: BarChart3,
                title: "Reports & analytics",
                description:
                  "Sales, revenue, and product performance. Pre-built reports for DEA, state board, and internal reconciliation.",
                color: "bg-amber-100 text-amber-600",
              },
              {
                icon: ClipboardList,
                title: "Point of sale",
                description:
                  "Fast POS with cart, discounts, and multiple payment methods. Optional prescription-linked dispensing workflow.",
                color: "bg-sky-100 text-sky-600",
              },
              {
                icon: FileCheck,
                title: "Compliance",
                description:
                  "Stay audit-ready with controlled substance logs, prescription records, and exportable compliance reports.",
                color: "bg-rose-100 text-rose-600",
              },
            ].map(({ icon: Icon, title, description, color }) => (
              <Card
                key={title}
                className="group border-slate-200/80 bg-slate-50/50 p-6 transition-all duration-200 hover:border-teal-200 hover:shadow-md focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2"
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${color} transition group-hover:scale-105`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        className="border-b border-slate-200/80 bg-slate-50/50 py-20 md:py-24"
        aria-labelledby="how-it-works-heading"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="how-it-works-heading"
              className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              How it works
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              From signup to daily use in four simple steps.
            </p>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: 1, title: "Sign up", body: "Create your account and add your pharmacy details. No credit card required for trial.", icon: "1" },
              { step: 2, title: "Configure", body: "Add categories, suppliers, and products—or import from Excel. Set low-stock and expiry rules.", icon: "2" },
              { step: 3, title: "Go live", body: "Start recording sales and prescriptions. Train staff on the POS and dashboard in minutes.", icon: "3" },
              { step: 4, title: "Support", body: "Use in-app help and email support. We’re here to help you stay compliant and efficient.", icon: "4" },
            ].map(({ step, title, body, icon }) => (
              <div key={step} className="relative text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-teal-600 bg-white font-display text-lg font-bold text-teal-600">
                  {icon}
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{body}</p>
                {step < 4 && (
                  <div className="absolute left-1/2 top-6 hidden h-0.5 w-full bg-slate-200 lg:block" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section
        className="border-b border-slate-200/80 bg-white py-20 md:py-24"
        aria-labelledby="why-us-heading"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="why-us-heading"
              className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              Why choose PharmaCare
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Built for pharmacies that take compliance and efficiency seriously.
            </p>
          </div>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Shield, title: "Compliance-first", body: "DEA and state board reporting, audit trails, and controlled substance logs." },
              { icon: Lock, title: "Secure & private", body: "Data encrypted at rest and in transit. Role-based access and audit logs." },
              { icon: HeadphonesIcon, title: "Real support", body: "Email and priority support on higher plans. Onboarding and docs included." },
              { icon: Plug, title: "Integrations", body: "APIs and export options for accounting, e-prescribing, and other tools." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* Testimonial / trust */}
      <section
        className="border-b border-slate-200/80 bg-slate-50/50 py-16 md:py-20"
        aria-labelledby="trust-heading"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <h2 id="trust-heading" className="sr-only">
            What pharmacies say about us
          </h2>
          <div className="mx-auto max-w-3xl">
            <Card className="border-slate-200/80 bg-white p-8 shadow-sm md:p-10">
              <Quote className="h-10 w-10 text-teal-200" aria-hidden />
              <blockquote className="mt-4 text-lg leading-relaxed text-slate-700">
                “We switched from spreadsheets to PharmaCare and cut our inventory errors in half.
                The expiry alerts and compliance reports save us hours every month.”
              </blockquote>
              <footer className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 font-display text-sm font-semibold text-teal-700">
                  MK
                </div>
                <div>
                  <cite className="font-display font-semibold not-italic text-slate-900">
                    Pharmacy owner, single location
                  </cite>
                </div>
              </footer>
            </Card>
            <p className="mt-6 text-center text-sm text-slate-500">
              Trusted by independent pharmacies and small chains to manage inventory, prescriptions,
              and compliance.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="scroll-mt-20 border-b border-slate-200/80 bg-white py-20 md:py-24"
        aria-labelledby="faq-heading"
      >
        <div className="container mx-auto max-w-3xl px-4">
          <h2
            id="faq-heading"
            className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Frequently asked questions
          </h2>
          <ul className="mt-10 space-y-4">
            {[
              {
                q: "Can I try PharmaCare before committing?",
                a: "Yes. You can start a free trial and set up your pharmacy, add products, and run sales. No credit card is required to begin. When you’re ready, choose a plan that fits your size and needs.",
              },
              {
                q: "Is my data secure and compliant?",
                a: "We use encryption for data at rest and in transit, and follow practices that support pharmacy compliance. You get audit trails, role-based access, and reports designed for DEA and state board requirements. We don’t sell your data.",
              },
              {
                q: "Do you support multiple locations?",
                a: "The Pro plan supports multiple users and richer reporting. The Enterprise plan includes multi-branch management, dedicated support, and custom onboarding. Contact us to discuss your setup.",
              },
              {
                q: "Can I import my existing inventory?",
                a: "Yes. You can add products manually or use our Excel import template to bulk-upload items with categories, suppliers, and stock levels. We’ll guide you through the format and any mappings.",
              },
            ].map(({ q, a }) => (
              <li key={q}>
                <details className="group rounded-lg border border-slate-200 bg-slate-50/50 transition hover:border-slate-300">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-inset">
                    {q}
                    <span className="h-5 w-5 shrink-0 rounded-full bg-slate-200 text-slate-600 transition group-open:rotate-180 group-open:bg-teal-100 group-open:text-teal-600">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </summary>
                  <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-600">
                    {a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section
        className="border-b border-slate-200/80 bg-slate-50/50 py-20 md:py-24"
        aria-labelledby="cta-heading"
      >
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <h2
            id="cta-heading"
            className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Ready to get started?
          </h2>
          <p className="mt-3 text-lg text-slate-600">
            Create your pharmacy workspace in minutes. No credit card required.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              asChild
              className="h-12 bg-teal-600 px-6 font-semibold hover:bg-teal-700 focus-visible:ring-teal-500"
            >
              <Link href="/onboarding">Create your pharmacy</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 border-slate-300 hover:bg-slate-100 focus-visible:ring-teal-500"
            >
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="bg-white py-12"
        role="contentinfo"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
                <Pill className="h-4 w-4" aria-hidden />
              </div>
              <span className="font-display font-semibold text-slate-900">PharmaCare</span>
            </Link>
            <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Footer navigation">
              <Link
                href="/auth/login"
                className="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
              <a
                href="#pricing"
                className="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                FAQ
              </a>
              <Link
                href="/onboarding"
                className="text-sm font-medium text-teal-600 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Get started
              </Link>
            </nav>
          </div>
          <p className="mt-8 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} PharmaCare. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
