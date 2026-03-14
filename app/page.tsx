import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Pill, Shield, Users, BarChart3, ArrowRight, Sparkles } from "lucide-react"
import Link from "next/link"

export default async function HomePage() {
  return (
    <div className="min-h-screen bg-[#f8fafb] text-[#0f172a]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-[#ffffff]/90 backdrop-blur-md">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d9488] text-white shadow-lg shadow-[#0d9488]/20">
              <Pill className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#0f172a]">PharmaCare</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild className="text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button asChild className="bg-[#0d9488] font-semibold text-white shadow-md hover:bg-[#0f766e]">
              <Link href="/onboarding">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[#0d9488]/20 bg-[#ccfbf1]/60 px-3.5 py-1 text-sm font-medium text-[#0f766e]">
            <Sparkles className="h-3.5 w-3.5" />
            Pharmacy management, simplified
          </p>
          <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-[#0f172a] sm:text-5xl md:text-6xl">
            One system for{" "}
            <span className="text-[#0d9488]">inventory, sales & prescriptions</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[#475569] sm:text-xl">
            Run your pharmacy with less hassle. Track stock, manage prescriptions, and serve customers from a single, secure dashboard.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild className="h-12 bg-[#0d9488] px-6 text-base font-semibold shadow-lg hover:bg-[#0f766e]">
              <Link href="/onboarding">
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 border-[#cbd5e1] px-6 text-base hover:bg-[#f1f5f9]">
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#e2e8f0] bg-white py-16 md:py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold text-[#0f172a] sm:text-3xl">Everything you need</h2>
            <p className="mt-2 text-[#64748b]">Features built for modern pharmacy operations</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="group border-[#e2e8f0] bg-[#f8fafb] p-6 transition hover:border-[#0d9488]/30 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#ccfbf1] text-[#0d9488] transition group-hover:bg-[#0d9488] group-hover:text-white">
                <Pill className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-[#0f172a]">Inventory</h3>
              <p className="mt-1 text-sm text-[#64748b]">Stock levels, expiry alerts, and reorder automation</p>
            </Card>
            <Card className="group border-[#e2e8f0] bg-[#f8fafb] p-6 transition hover:border-[#0d9488]/30 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#d1fae5] text-[#059669] transition group-hover:bg-[#059669] group-hover:text-white">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-[#0f172a]">Prescriptions</h3>
              <p className="mt-1 text-sm text-[#64748b]">Safe handling and verification built in</p>
            </Card>
            <Card className="group border-[#e2e8f0] bg-[#f8fafb] p-6 transition hover:border-[#0d9488]/30 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#e0e7ff] text-[#4f46e5] transition group-hover:bg-[#4f46e5] group-hover:text-white">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-[#0f172a]">Customers</h3>
              <p className="mt-1 text-sm text-[#64748b]">Records, history, and insurance details</p>
            </Card>
            <Card className="group border-[#e2e8f0] bg-[#f8fafb] p-6 transition hover:border-[#0d9488]/30 hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#fed7aa] text-[#ea580c] transition group-hover:bg-[#ea580c] group-hover:text-white">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-[#0f172a]">Reports</h3>
              <p className="mt-1 text-sm text-[#64748b]">Analytics and compliance-ready reports</p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#e2e8f0] bg-[#f8fafb] py-14">
        <div className="container mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-xl font-bold text-[#0f172a]">Ready to get started?</h2>
          <p className="mt-1 text-[#64748b]">Create your pharmacy workspace in minutes.</p>
          <Button asChild className="mt-5 bg-[#0d9488] font-semibold hover:bg-[#0f766e]">
            <Link href="/onboarding">Create your pharmacy</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-[#e2e8f0] bg-white py-6">
        <div className="container mx-auto max-w-6xl px-4 text-center text-sm text-[#64748b]">
          © {new Date().getFullYear()} PharmaCare. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
