import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { headers } from "next/headers"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { canAccessTenantDashboard } from "@/lib/api/dotnet-session"
import { tenantForHost } from "@/lib/api/dotnet-bff"

interface PageProps {
  params: Promise<{ slug: string }>
}

function TenantDashboardView({ name, code }: { name: string; code: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-5 rounded-2xl border bg-card p-8 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15" aria-hidden>
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {name} tenant dashboard
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You are viewing the tenant-scoped dashboard for <span className="font-medium text-foreground">{code}</span>. Regular
          users can only access their own tenant, while superadmins can view any tenant via the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/t/&lt;slug&gt;/dashboard</code> path or matching
          subdomain.
        </p>
        <Button asChild>
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </div>
    </main>
  )
}

export default async function TenantDashboardPage({ params }: PageProps) {
  const { slug } = await params
  const tenantCode = decodeURIComponent(slug).trim().toLowerCase()

  if (!tenantCode) {
    notFound()
  }

  // The .NET path decides access from the session alone: the tenant claim must match the slug or the
  // host-resolved tenant, and the caller must hold a tenant-user permission.
  const session = await getDotnetSession()
  if (!session) {
    redirect(`/?auth=signin&code=${encodeURIComponent(tenantCode)}`)
  }
  const hostTenant = tenantForHost((await headers()).get("host"))
  if (!canAccessTenantDashboard(session.user, tenantCode, hostTenant)) {
    redirect("/dashboard")
  }
  return <TenantDashboardView name={tenantCode} code={tenantCode} />
}
