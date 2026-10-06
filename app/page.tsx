import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
  CheckCircle2,
  Quote,
  Star,
  TrendingUp,
  AlertTriangle,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { PricingSection } from "@/components/landing/pricing-section"
import { AuthDialogButton, AuthDialogLink } from "@/components/auth-dialog/auth-dialog-trigger"
import { backendTarget } from "@/lib/api/backend-target"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

const CHART_BARS = [38, 52, 46, 64, 58, 78, 70, 90, 82, 68, 74, 96]

export default async function HomePage() {
  let isAuthed = false
  if (backendTarget("AUTH") === "dotnet") {
    isAuthed = (await getDotnetSession()) !== null
  } else {
    const { createClient } = await import("@/lib/supabase/server")
    const supabase = await createClient()
    isAuthed = !!(await supabase.auth.getUser()).data?.user
  }

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-900 antialiased">
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl"
        role="banner"
      >
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            aria-label="PharmaCare home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-600/25">
              <Pill className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              PharmaCare
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <a
              href="#features"
              className="hidden rounded-md px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:block"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="hidden rounded-md px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:block"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="hidden rounded-md px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:block"
            >
              FAQ
            </a>
            <div className="ml-2 flex items-center gap-2">
              {isAuthed ? (
                <Button
                  asChild
                  className="bg-slate-900 font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:ring-teal-500"
                >
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <AuthDialogButton
                    mode="signin"
                    variant="ghost"
                    className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                  >
                    Sign in
                  </AuthDialogButton>
                  <AuthDialogButton
                    mode="onboarding"
                    className="bg-slate-900 font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:ring-teal-500"
                  >
                    Get started
                  </AuthDialogButton>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="hero-heading"
      >
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-[-8rem] h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-teal-100/70 via-teal-50/40 to-transparent blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(15,23,42,0.08) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "linear-gradient(to bottom, black, transparent 70%)",
              WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)",
            }}
          />
        </div>

        <div className="container mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 md:pb-28 md:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p
              id="hero-badge"
              className="mb-7 inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-white/80 px-4 py-1.5 text-sm font-medium text-teal-800 shadow-sm backdrop-blur"
            >
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600" />
              </span>
              Built for compliance-first pharmacy operations
            </p>
            <h1
              id="hero-heading"
              className="text-balance font-display text-[2.75rem] font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl md:text-[3.75rem]"
            >
              The operating system for{" "}
              <span className="bg-gradient-to-br from-teal-600 to-teal-800 bg-clip-text text-transparent">
                modern pharmacies
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
              Inventory, prescriptions, sales, and compliance reporting — unified in one secure
              dashboard. Built for pharmacies that can&rsquo;t afford to get this wrong.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {isAuthed ? (
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-slate-900 px-7 text-base font-semibold shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/15 focus-visible:ring-teal-500"
                >
                  <Link href="/dashboard">
                    Go to dashboard
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              ) : (
                <>
                  <AuthDialogButton
                    mode="onboarding"
                    size="lg"
                    className="h-12 bg-slate-900 px-7 text-base font-semibold shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/15 focus-visible:ring-teal-500"
                  >
                    Start free trial
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </AuthDialogButton>
                  <AuthDialogButton
                    mode="signin"
                    size="lg"
                    variant="outline"
                    className="h-12 border-slate-300 bg-white/70 px-7 text-base backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white focus-visible:ring-teal-500"
                  >
                    Sign in
                  </AuthDialogButton>
                </>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-600" aria-hidden />
                No credit card required
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-600" aria-hidden />
                Live in under 15 minutes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-600" aria-hidden />
                Cancel anytime
              </span>
            </div>
          </div>

          {/* Product visual */}
          <div className="relative mx-auto mt-16 max-w-4xl md:mt-20" aria-hidden>
            <div className="pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 rounded-[2.5rem] bg-gradient-to-b from-teal-100/60 to-transparent blur-2xl" />

            <div className="rotate-[0.6deg] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_70px_-15px_rgba(15,23,42,0.25)] transition-transform duration-500 hover:rotate-0">
              {/* Chrome bar */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                </div>
                <div className="mx-auto flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-slate-400 shadow-sm">
                  <Lock className="h-3 w-3" />
                  app.pharmacare.io/dashboard
                </div>
              </div>

              {/* Mock dashboard body */}
              <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <TrendingUp className="h-3 w-3" /> 12.4%
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Rs 4.82L</p>
                  <p className="text-xs text-slate-500">Revenue this month</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                      <ClipboardList className="h-4 w-4" />
                    </span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <TrendingUp className="h-3 w-3" /> 8.1%
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">1,204</p>
                  <p className="text-xs text-slate-500">Orders fulfilled</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      Attention
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">18</p>
                  <p className="text-xs text-slate-500">Low-stock items</p>
                </div>

                <div className="flex items-end gap-1.5 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:col-span-2">
                  {CHART_BARS.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-gradient-to-t from-teal-600 to-teal-400"
                      style={{ height: `${h}px`, opacity: 0.55 + (i / CHART_BARS.length) * 0.45 }}
                    />
                  ))}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs font-medium text-slate-500">Recent activity</p>
                  <ul className="mt-3 space-y-2.5">
                    <li className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                      Prescription verified
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      Stock received
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      Report exported
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Floating accent card */}
            <div className="absolute -bottom-6 -left-6 hidden w-56 rotate-[-3deg] rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl shadow-slate-900/10 sm:block">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <Shield className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-900">Audit-ready</p>
                  <p className="text-[11px] text-slate-500">Compliance report generated</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-4 -top-5 hidden rotate-[3deg] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xl shadow-slate-900/10 md:block">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                Synced across branches
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="scroll-mt-20 border-t border-slate-200/70 bg-white py-20 md:py-28"
        aria-labelledby="features-heading"
      >
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Platform</p>
            <h2
              id="features-heading"
              className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              Everything your pharmacy runs on
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Purpose-built modules for inventory, dispensing, and regulatory reporting.
            </p>
          </div>
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Pill,
                title: "Inventory",
                description:
                  "Track stock levels, set reorder points, and get expiry alerts. Barcode support and batch tracking keep your shelves accurate.",
                color: "from-teal-500 to-teal-700",
              },
              {
                icon: Shield,
                title: "Prescriptions",
                description:
                  "Safe handling and verification built in. Manage prescribed vs dispensed quantities and maintain a clear audit trail.",
                color: "from-emerald-500 to-emerald-700",
              },
              {
                icon: Users,
                title: "Customers",
                description:
                  "Customer records, purchase history, and optional insurance details. Link prescriptions and sales for a full view.",
                color: "from-indigo-500 to-indigo-700",
              },
              {
                icon: BarChart3,
                title: "Reports & analytics",
                description:
                  "Sales, revenue, and product performance. IRD-oriented exports, narcotic register, and GL reconciliation.",
                color: "from-amber-500 to-amber-700",
              },
              {
                icon: ClipboardList,
                title: "Point of sale",
                description:
                  "Fast POS with cart, discounts, and multiple payment methods. Optional prescription-linked dispensing workflow.",
                color: "from-sky-500 to-sky-700",
              },
              {
                icon: FileCheck,
                title: "Compliance",
                description:
                  "Stay audit-ready with controlled substance logs, prescription records, and exportable compliance reports.",
                color: "from-rose-500 to-rose-700",
              },
            ].map(({ icon: Icon, title, description, color }) => (
              <Card
                key={title}
                className="group relative overflow-hidden border-slate-200/80 p-6 shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.25)] focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2"
              >
                <div
                  className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                <span
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden
                >
                  Learn more <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        className="border-t border-slate-200/70 bg-slate-50/60 py-20 md:py-28"
        aria-labelledby="how-it-works-heading"
      >
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Onboarding</p>
            <h2
              id="how-it-works-heading"
              className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              From signup to live in an afternoon
            </h2>
            <p className="mt-4 text-lg text-slate-600">Four steps. No implementation team required.</p>
          </div>
          <div className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <div
              className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent lg:block"
              aria-hidden
            />
            {[
              { step: "01", title: "Sign up", body: "Create your account and add your pharmacy details. No credit card required for trial." },
              { step: "02", title: "Configure", body: "Add categories, suppliers, and products—or import from Excel. Set low-stock and expiry rules." },
              { step: "03", title: "Go live", body: "Start recording sales and prescriptions. Train staff on the POS and dashboard in minutes." },
              { step: "04", title: "Support", body: "Use in-app help and email support. We're here to help you stay compliant and efficient." },
            ].map(({ step, title, body }) => (
              <div key={step} className="relative text-center">
                <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white font-display text-sm font-bold text-slate-900 shadow-sm">
                  {step}
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section
        className="border-t border-slate-200/70 bg-white py-20 md:py-28"
        aria-labelledby="why-us-heading"
      >
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="why-us-heading"
              className="text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              Why pharmacies choose PharmaCare
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Built for teams that take compliance and efficiency seriously.
            </p>
          </div>
          <div className="mt-16 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Shield, title: "Compliance-first", body: "IRD-oriented invoicing, VAT summaries, narcotic register, and full audit trails." },
              { icon: Lock, title: "Secure & private", body: "Data encrypted at rest and in transit. Role-based access and audit logs." },
              { icon: HeadphonesIcon, title: "Real support", body: "Email and priority support on higher plans. Onboarding and docs included." },
              { icon: Plug, title: "Integrations", body: "APIs and export options for accounting, e-prescribing, and other tools." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-teal-100 bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection authenticated={isAuthed} />

      {/* Testimonial / trust */}
      <section
        className="border-t border-slate-200/70 bg-slate-50/60 py-20 md:py-24"
        aria-labelledby="trust-heading"
      >
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="trust-heading" className="sr-only">
            What pharmacies say about us
          </h2>
          <div className="mx-auto max-w-3xl">
            <Card className="relative overflow-hidden border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.2)] md:p-12">
              <Quote
                className="absolute -right-4 -top-4 h-28 w-28 text-teal-50"
                strokeWidth={1}
                aria-hidden
              />
              <div className="relative">
                <div className="flex gap-0.5 text-amber-400" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-5 text-balance font-display text-xl leading-relaxed text-slate-800 md:text-2xl">
                  &ldquo;We switched from spreadsheets to PharmaCare and cut our inventory errors in
                  half. The expiry alerts and compliance reports save us hours every month.&rdquo;
                </blockquote>
                <footer className="mt-7 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 font-display text-sm font-semibold text-white">
                    MK
                  </div>
                  <div>
                    <cite className="font-display text-sm font-semibold not-italic text-slate-900">
                      Pharmacy owner
                    </cite>
                    <p className="text-sm text-slate-500">Single-location independent pharmacy</p>
                  </div>
                </footer>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="scroll-mt-20 border-t border-slate-200/70 bg-white py-20 md:py-28"
        aria-labelledby="faq-heading"
      >
        <div className="container mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2
              id="faq-heading"
              className="text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            >
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg text-slate-600">Everything you need to know before you start.</p>
          </div>
          <ul className="mt-12 space-y-3">
            {[
              {
                q: "Can I try PharmaCare before committing?",
                a: "Yes. You can start a free trial and set up your pharmacy, add products, and run sales. No credit card is required to begin. When you're ready, choose a plan that fits your size and needs.",
              },
              {
                q: "Is my data secure and compliant?",
                a: "We use encryption for data at rest and in transit, with tenant isolation and role-based access. You get audit trails and reports oriented to Nepal pharmacy operations (IRD, VAT, narcotic register). We don't sell your data.",
              },
              {
                q: "Do you support multiple locations?",
                a: "The Pro plan supports multiple users and richer reporting. The Enterprise plan includes multi-branch management, dedicated support, and custom onboarding. Contact us to discuss your setup.",
              },
              {
                q: "Can I import my existing inventory?",
                a: "Yes. You can add products manually or use our Excel import template to bulk-upload items with categories, suppliers, and stock levels. We'll guide you through the format and any mappings.",
              },
            ].map(({ q, a }) => (
              <li key={q}>
                <details className="group rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300 open:border-teal-200 open:bg-teal-50/30">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4.5 font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-inset">
                    {q}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-all duration-200 group-open:rotate-180 group-open:bg-teal-600 group-open:text-white">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </summary>
                  <div className="px-5 pb-5 text-sm leading-relaxed text-slate-600">
                    {a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-slate-950 py-20 md:py-28" aria-labelledby="cta-heading">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-600/20 blur-[100px]" />
        </div>
        <div className="container relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2
            id="cta-heading"
            className="text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Ready to run your pharmacy smarter?
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Create your pharmacy workspace in minutes. No credit card required.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            {isAuthed ? (
              <Button
                asChild
                size="lg"
                className="h-12 bg-white px-7 font-semibold text-slate-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:ring-teal-400 focus-visible:ring-offset-slate-950"
              >
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <AuthDialogButton
                  mode="onboarding"
                  size="lg"
                  className="h-12 bg-white px-7 font-semibold text-slate-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:ring-teal-400 focus-visible:ring-offset-slate-950"
                >
                  Create your pharmacy
                </AuthDialogButton>
                <AuthDialogButton
                  mode="signin"
                  size="lg"
                  variant="outline"
                  className="h-12 border-slate-700 bg-transparent px-7 text-white hover:bg-white/10 focus-visible:ring-teal-400 focus-visible:ring-offset-slate-950"
                >
                  Sign in
                </AuthDialogButton>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12" role="contentinfo">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 border-t border-slate-100 pt-10 sm:flex-row">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 text-white">
                <Pill className="h-4 w-4" aria-hidden />
              </div>
              <span className="font-display font-semibold text-slate-900">PharmaCare</span>
            </Link>
            <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Footer navigation">
              {isAuthed ? (
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  Dashboard
                </Link>
              ) : (
                <AuthDialogLink
                  mode="signin"
                  className="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  Sign in
                </AuthDialogLink>
              )}
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
                href="/privacy"
                className="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Terms
              </Link>
              {!isAuthed && (
                <AuthDialogLink
                  mode="onboarding"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  Get started
                </AuthDialogLink>
              )}
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
