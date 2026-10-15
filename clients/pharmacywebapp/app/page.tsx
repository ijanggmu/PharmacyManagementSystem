import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  Banknote,
  BookOpen,
  CalendarDays,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitBranch,
  HeartPulse,
  Lock,
  Menu,
  PackageCheck,
  Pill,
  Quote,
  Receipt,
  ScanLine,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
  WifiOff,
} from "lucide-react"
import { BrandMark } from "@/components/brand/brand-mark"
import Link from "next/link"
import { PricingSection } from "@/components/landing/pricing-section"
import { HeroCounter } from "@/components/landing/hero-counter"
import { AuthDialogButton, AuthDialogLink } from "@/components/auth-dialog/auth-dialog-trigger"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { TESTIMONIALS } from "@/lib/constants/testimonials"

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
const NAV_LINKS = [
  { href: "#day", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
]

/** One day at a real counter, in the order the app is used. */
const DAY = [
  {
    time: "8:00",
    icon: Banknote,
    title: "Open the drawer",
    body: "The cashier counts the opening float. No cash sale goes through until a shift is open.",
  },
  {
    time: "9:15",
    icon: ScanLine,
    title: "Scan and sell",
    body: "Scan a barcode and the medicine lands in the cart from the lot that expires first. Cash, card, eSewa, Khalti, Fonepay or on credit.",
  },
  {
    time: "11:30",
    icon: HeartPulse,
    title: "Dispense a prescription",
    body: "Pick the patient's prescription and the cart fills with what is still owed. Allergy and interaction checks run before billing.",
  },
  {
    time: "14:00",
    icon: Truck,
    title: "Receive a delivery",
    body: "Batch numbers, expiry dates and cost go in once. Duplicate supplier bills and past-expiry stock are refused.",
  },
  {
    time: "17:00",
    icon: Calculator,
    title: "Book the expenses",
    body: "The accountant records today's bills. Every sale, return and payment has already posted to the ledger.",
  },
  {
    time: "20:00",
    icon: ClipboardCheck,
    title: "Count and close",
    body: "The cashier counts the drawer; the app shows what should be there and prints the Z-report.",
  },
]

const ROLES = [
  { icon: Store, role: "Owner", sees: "Profit, cash and bank, VAT due and every branch at a glance." },
  { icon: UserCog, role: "Manager", sees: "Stock, purchase orders, transfers, price levels and approvals." },
  { icon: Pill, role: "Pharmacist", sees: "Prescriptions, the narcotic register, sales and returns." },
  { icon: ShoppingCart, role: "Cashier", sees: "The till, returns and the drawer. Nothing it doesn't need." },
  { icon: BookOpen, role: "Accountant", sees: "Vouchers, expenses, bank, TDS, VAT returns and statements." },
  { icon: Users, role: "Staff", sees: "Look up a medicine, its price and stock. Read-only." },
]

const FAQ = [
  {
    q: "Can I try PharmaCare before committing?",
    a: "Yes. Request a workspace and set up your pharmacy, add products and run sales. No credit card is needed to begin; choose a plan when you are ready.",
  },
  {
    q: "Does it follow Nepal's invoicing and VAT rules?",
    a: "Invoices carry Bikram Sambat dates, fiscal-year numbering, the VAT split and the amount in words. The sales register, VAT return and the DDA narcotic register are built in.",
  },
  {
    q: "What happens when the internet drops?",
    a: "The till keeps taking sales and syncs them when the connection is back, stamped with the time they were actually made.",
  },
  {
    q: "How long does a sign-in last?",
    a: "A sign-in stays active for up to 7 days of use, refreshing quietly in the background. Signing out, a password change or an admin deactivating the user ends it at once.",
  },
  {
    q: "Can I import my existing stock?",
    a: "Yes. Bring products in from Excel with categories, suppliers and stock levels, then enter opening balances with the guided migration.",
  },
  {
    q: "Is my data secure?",
    a: "Each pharmacy's data is isolated, encrypted in transit and at rest, and every role sees only what it needs. Sensitive actions are recorded in an audit log.",
  },
]

export default async function HomePage() {
  // A signed-in visitor is sent to the dashboard by the proxy; this covers the rare render that slips past it.
  const isAuthed = (await getDotnetSession()) !== null

  return (
    <div className="light min-h-dvh bg-[#f7f9f8] text-slate-900 antialiased">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-[#f7f9f8]/85 backdrop-blur-xl" role="banner">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className={`flex items-center gap-2.5 rounded-lg ${FOCUS}`} aria-label="PharmaCare home">
            <BrandMark className="size-9" />
            <span className="font-display text-lg font-bold tracking-tight">PharmaCare</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`hidden rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 md:block ${FOCUS}`}
              >
                {item.label}
              </a>
            ))}
            <details className="group relative md:hidden">
              <summary
                className={`flex size-11 cursor-pointer list-none items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden ${FOCUS}`}
                aria-label="Open menu"
              >
                <Menu className="size-5" aria-hidden />
              </summary>
              <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {NAV_LINKS.map((item) => (
                  <a key={item.href} href={item.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {item.label}
                  </a>
                ))}
              </div>
            </details>
            <div className="ml-1 flex items-center gap-2 sm:ml-3">
              {isAuthed ? (
                <Button asChild className="bg-slate-900 font-semibold text-white hover:bg-slate-800">
                  <Link href="/dashboard">Open dashboard</Link>
                </Button>
              ) : (
                <>
                  <AuthDialogButton mode="signin" variant="ghost" className="hidden text-slate-700 hover:bg-slate-100 min-[400px]:inline-flex">
                    Sign in
                  </AuthDialogButton>
                  <AuthDialogButton mode="onboarding" className="bg-slate-900 font-semibold text-white hover:bg-slate-800">
                    Get started
                  </AuthDialogButton>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        {/* Hero */}
        <section className="relative overflow-hidden" aria-labelledby="hero-heading">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(15,118,110,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,118,110,0.07) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage: "radial-gradient(ellipse at 70% 30%, black 20%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(ellipse at 70% 30%, black 20%, transparent 70%)",
              }}
            />
          </div>

          <div className="mx-auto grid max-w-6xl items-start gap-16 px-4 pb-20 pt-12 sm:px-6 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1 text-sm font-medium text-teal-800">
                <span className="size-1.5 rounded-full bg-teal-600" aria-hidden />
                Made for pharmacies in Nepal
              </p>
              <h1
                id="hero-heading"
                className="mt-6 text-balance font-display text-[2.6rem] font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.6rem]"
              >
                Run the counter.
                <br />
                <span className="text-teal-700">We&rsquo;ll keep the books.</span>
              </h1>
              <p lang="ne" className="mt-4 font-display text-lg font-medium text-slate-500">
                फार्मेसी चलाउन, अब सजिलो।
              </p>
              <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-slate-600">
                Billing, prescriptions, stock with expiry, cash shifts and double-entry accounts in one workspace,
                with IRD-ready invoices and Bikram Sambat dates from day one.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {isAuthed ? (
                  <Button asChild size="lg" className="h-12 bg-slate-900 px-7 text-base font-semibold hover:bg-slate-800">
                    <Link href="/dashboard">
                      Open dashboard
                      <ArrowRight className="ml-1.5 size-4" aria-hidden />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <AuthDialogButton mode="onboarding" size="lg" className="h-12 bg-teal-700 px-7 text-base font-semibold text-white hover:bg-teal-800">
                      Start free
                      <ArrowRight className="ml-1.5 size-4" aria-hidden />
                    </AuthDialogButton>
                    <AuthDialogButton mode="signin" size="lg" variant="outline" className="h-12 border-slate-300 bg-white px-7 text-base hover:bg-slate-50">
                      Sign in
                    </AuthDialogButton>
                  </>
                )}
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                {["No credit card", "Guided data import", "Keeps selling offline"].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-teal-700" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <HeroCounter />
          </div>
        </section>

        {/* Built for Nepal */}
        <section aria-labelledby="local-heading" className="border-y border-slate-200/70 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-9 sm:px-6">
            <h2 id="local-heading" className="sr-only">Built for how pharmacies in Nepal work</h2>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { icon: Receipt, label: "IRD-ready invoices & VAT" },
                { icon: CalendarDays, label: "Bikram Sambat dates" },
                { icon: ScrollText, label: "DDA narcotic register" },
                { icon: Wallet, label: "eSewa, Khalti & Fonepay" },
                { icon: GitBranch, label: "Many branches, one view" },
                { icon: WifiOff, label: "Offline-safe till" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                  <Icon className="size-5 shrink-0 text-teal-700" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* A day at the counter */}
        <section id="day" className="scroll-mt-20 py-20 md:py-28" aria-labelledby="day-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">A day at the counter</p>
              <h2 id="day-heading" className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
                From the opening float to the Z-report
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                This is the day PharmaCare is built around. Each step is one screen, and the books keep themselves.
              </p>
            </div>

            <ol className="relative mt-14 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
              {DAY.map(({ time, icon: Icon, title, body }, i) => (
                <li key={time} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-white text-teal-700">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {i < DAY.length - 1 && <span className="mt-2 w-px flex-1 bg-slate-200 md:hidden" aria-hidden />}
                  </div>
                  <div className="pb-2">
                    <p className="font-mono text-xs font-semibold tabular-nums text-teal-700">{time}</p>
                    <h3 className="mt-1 font-display text-lg font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-slate-200/70 bg-white py-20 md:py-28" aria-labelledby="features-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Everything in one place</p>
              <h2 id="features-heading" className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
                The whole pharmacy, not just the till
              </h2>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-6">
              <article className="rounded-2xl border border-slate-200 bg-slate-900 p-7 text-white md:col-span-4 md:row-span-2">
                <ShoppingCart className="size-6 text-teal-300" aria-hidden />
                <h3 className="mt-5 font-display text-2xl font-semibold">A till that keeps up with a queue</h3>
                <p className="mt-3 max-w-lg text-slate-300">
                  Barcode to cart in one scan, hold and recall bills, split payments, credit for regular customers and
                  printed invoices on 58 mm, 80 mm or A5 paper, in English or Nepali.
                </p>
                <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                  {[
                    { k: "Ways to pay", v: "8" },
                    { k: "Paper sizes", v: "3" },
                    { k: "Languages", v: "2" },
                  ].map(({ k, v }) => (
                    <div key={k}>
                      <dt className="text-xs text-slate-400">{k}</dt>
                      <dd className="mt-1 font-display text-3xl font-bold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
              <FeatureCard
                className="md:col-span-2"
                icon={HeartPulse}
                title="Safe dispensing"
                body="Prescription-only and controlled medicines need a valid prescription. Allergies and interactions are checked."
              />
              <FeatureCard
                className="md:col-span-2"
                icon={PackageCheck}
                title="Stock with expiry"
                body="Batches, FEFO picking, expiry alerts, recalls, stock counts and transfers between branches."
              />
              <FeatureCard
                className="md:col-span-2"
                icon={Truck}
                title="Purchasing"
                body="Reorder suggestions, purchase orders, goods receipts, supplier ledgers and consignment."
              />
              <FeatureCard
                className="md:col-span-2"
                icon={BookOpen}
                title="Real accounts"
                body="Double-entry books with trial balance, P&L, balance sheet, cheques, bank import and TDS."
              />
              <FeatureCard
                className="md:col-span-2"
                icon={FileText}
                title="Compliance"
                body="Sales register, VAT return, DDA register and an audit log of every sensitive action."
              />
            </div>
          </div>
        </section>

        {/* Roles */}
        <section className="border-t border-slate-200/70 py-20 md:py-28" aria-labelledby="roles-heading">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Access</p>
              <h2 id="roles-heading" className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
                One workspace, six roles
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Everyone signs in with their own account and sees the screens their job needs. The cashier never
                sees the profit; the owner never has to ask for it.
              </p>
              <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lock className="size-4 text-teal-700" aria-hidden />
                Permissions can be adjusted per role.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ROLES.map(({ icon: Icon, role, sees }) => (
                <li key={role} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <Icon className="mt-0.5 size-5 shrink-0 text-teal-700" aria-hidden />
                  <div>
                    <h3 className="font-display font-semibold">{role}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{sees}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <PricingSection authenticated={isAuthed} />

        {/* Testimonials: only real, attributable quotes (lib/constants/testimonials.ts) */}
        {TESTIMONIALS.length > 0 && (
          <section className="border-t border-slate-200/70 bg-white py-20 md:py-24" aria-labelledby="trust-heading">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 id="trust-heading" className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
                What pharmacies say
              </h2>
              <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
                {TESTIMONIALS.map((t) => (
                  <figure key={`${t.name}-${t.role}`} className="rounded-2xl border border-slate-200 bg-[#f7f9f8] p-7">
                    <Quote className="size-6 text-teal-700" aria-hidden />
                    <blockquote className="mt-4 text-pretty font-display text-lg leading-relaxed text-slate-800">
                      &ldquo;{t.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-5 text-sm">
                      <cite className="font-semibold not-italic text-slate-900">{t.name}</cite>
                      <span className="text-slate-500"> · {t.role}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-slate-200/70 bg-white py-20 md:py-28" aria-labelledby="faq-heading">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 id="faq-heading" className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Questions pharmacists ask
              </h2>
              <p className="mt-4 text-lg text-slate-600">Something else on your mind? Ask us when you request your workspace.</p>
            </div>
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map(({ q, a }) => (
                <li key={q}>
                  <details className="group">
                    <summary
                      className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-slate-900 [&::-webkit-details-marker]:hidden ${FOCUS}`}
                    >
                      {q}
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform duration-200 group-open:rotate-45 group-open:border-teal-600 group-open:text-teal-700 motion-reduce:transition-none"
                        aria-hidden
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                          <path d="M10 4a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 10 4Z" />
                        </svg>
                      </span>
                    </summary>
                    <p className="pb-5 pr-10 text-sm leading-relaxed text-slate-600">{a}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-teal-800 py-20 md:py-24" aria-labelledby="cta-heading">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 id="cta-heading" className="text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Open tomorrow&rsquo;s shift on PharmaCare.
              </h2>
              <p className="mt-3 text-lg text-teal-100">Request a workspace today; we set it up and help bring your stock across.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isAuthed ? (
                <Button asChild size="lg" className="h-12 bg-white px-7 font-semibold text-teal-900 hover:bg-teal-50">
                  <Link href="/dashboard">Open dashboard</Link>
                </Button>
              ) : (
                <>
                  <AuthDialogButton mode="onboarding" size="lg" className="h-12 bg-white px-7 font-semibold text-teal-900 hover:bg-teal-50 focus-visible:ring-white focus-visible:ring-offset-teal-800">
                    Start free
                  </AuthDialogButton>
                  <AuthDialogButton
                    mode="signin"
                    size="lg"
                    variant="outline"
                    className="h-12 border-teal-400 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-teal-800"
                  >
                    Sign in
                  </AuthDialogButton>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#f7f9f8] py-10" role="contentinfo">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <Link href="/" className={`flex items-center gap-2 rounded-lg ${FOCUS}`}>
            <BrandMark className="size-8" />
            <span className="font-display font-semibold">PharmaCare</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-600" aria-label="Footer navigation">
            {isAuthed ? (
              <Link href="/dashboard" className={`font-medium text-teal-700 hover:text-teal-800 ${FOCUS}`}>Dashboard</Link>
            ) : (
              <AuthDialogLink mode="signin" className={`hover:text-slate-900 ${FOCUS}`}>Sign in</AuthDialogLink>
            )}
            <a href="#pricing" className={`hover:text-slate-900 ${FOCUS}`}>Pricing</a>
            <a href="#faq" className={`hover:text-slate-900 ${FOCUS}`}>FAQ</a>
            <Link href="/privacy" className={`hover:text-slate-900 ${FOCUS}`}>Privacy</Link>
            <Link href="/terms" className={`hover:text-slate-900 ${FOCUS}`}>Terms</Link>
          </nav>
          <p className="text-sm text-slate-500">
            <ShieldCheck className="mr-1 inline size-4 align-[-3px] text-teal-700" aria-hidden />© {new Date().getFullYear()} PharmaCare
          </p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  className = "",
}: {
  icon: typeof Pill
  title: string
  body: string
  className?: string
}) {
  return (
    <article className={`rounded-2xl border border-slate-200 bg-[#f7f9f8] p-6 transition-colors duration-150 hover:border-teal-300 ${className}`}>
      <Icon className="size-6 text-teal-700" aria-hidden />
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </article>
  )
}
