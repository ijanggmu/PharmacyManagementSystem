import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Privacy Policy | PharmaCare",
  description: "How PharmaCare handles pharmacy and account data.",
}

export default function PrivacyPage() {
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
        <h1>Privacy Policy</h1>
        <p className="text-sm text-slate-500">Last updated: May 2026</p>
        <p>
          PharmaCare is a pharmacy management platform. This policy describes how we process data when you use the
          service as a pharmacy operator or staff member.
        </p>
        <h2>Data we collect</h2>
        <ul>
          <li>Account information (name, email, role, tenant and branch assignment)</li>
          <li>Operational records you enter: inventory, sales, prescriptions, customers, suppliers, and accounting entries</li>
          <li>Technical logs required for security, auditing, and troubleshooting</li>
        </ul>
        <h2>How we use data</h2>
        <p>
          Data is used to provide the application, enforce access controls, generate compliance and financial reports,
          and improve reliability. We do not sell personal data.
        </p>
        <h2>Storage and security</h2>
        <p>
          Data is stored in encrypted databases with row-level security per pharmacy tenant. Access is limited by role.
          You are responsible for safeguarding staff credentials and devices used at the counter.
        </p>
        <h2>Retention and export</h2>
        <p>
          Records are retained according to your pharmacy&apos;s business and legal requirements. Contact your tenant
          administrator for export or deletion requests.
        </p>
        <h2>Contact</h2>
        <p>
          For privacy questions, contact the pharmacy that provisioned your account or the platform operator listed in
          your service agreement.
        </p>
        <p>
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </main>
    </div>
  )
}
