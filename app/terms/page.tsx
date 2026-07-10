import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Terms of Service | PharmaCare",
  description: "Terms for using the PharmaCare pharmacy management platform.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#f8fafb] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold text-teal-700 hover:underline">
            PharmaCare
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </header>
      <main className="container mx-auto max-w-3xl px-4 py-12 prose prose-slate">
        <h1>Terms of Service</h1>
        <p className="text-sm text-slate-500">Last updated: May 2026</p>
        <p>
          By using PharmaCare you agree to these terms on behalf of your pharmacy or organization. If you do not agree,
          do not use the service.
        </p>
        <h2>Service</h2>
        <p>
          PharmaCare provides inventory, point of sale, prescriptions, supplier and accounting tools oriented to
          pharmacies in Nepal, including IRD-oriented reporting features. Features may change; critical compliance
          remains your responsibility as the licensed operator.
        </p>
        <h2>Accounts</h2>
        <p>
          You must provide accurate registration information, keep passwords confidential, and assign roles appropriate
          to staff duties. You are liable for activity under your tenant account.
        </p>
        <h2>Acceptable use</h2>
        <ul>
          <li>Use the system only for lawful pharmacy operations</li>
          <li>Do not attempt to bypass security, access other tenants&apos; data, or disrupt the platform</li>
          <li>Do not upload malicious code or unlawful content</li>
        </ul>
        <h2>Data accuracy</h2>
        <p>
          Reports (including VAT, IRD, and GL) depend on data you enter and vouchers posted. Verify figures before filing
          with tax authorities or auditors.
        </p>
        <h2>Availability</h2>
        <p>
          We aim for high availability but do not guarantee uninterrupted service. Planned maintenance and third-party
          outages may occur.
        </p>
        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, the platform is provided &quot;as is&quot; without warranties. We are not liable for
          indirect losses, regulatory penalties, or stock discrepancies arising from misuse or incomplete data entry.
        </p>
        <h2>Privacy</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how personal and operational data is handled.
        </p>
      </main>
    </div>
  )
}
