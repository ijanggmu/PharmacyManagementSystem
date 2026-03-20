import { createServerClient } from "@supabase/ssr"
import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TenantDashboardPage({ params }: PageProps) {
  const { slug } = await params
  const tenantCode = decodeURIComponent(slug).trim().toLowerCase()

  if (!tenantCode) {
    redirect("/dashboard")
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
          // no-op on server component; auth is enforced via middleware
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/?auth=signin&code=${encodeURIComponent(tenantCode)}`)
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single()

  if (!appUser) {
    redirect("/dashboard")
  }

  const { tenant_id, role } = appUser as { tenant_id: string | null; role: string | null }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, code")
    .eq("code", tenantCode)
    .eq("is_active", true)
    .single()

  if (!tenant) {
    redirect("/dashboard")
  }

  if (role !== "superadmin" && tenant_id !== tenant.id) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafb] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">
          {tenant.name} tenant dashboard
        </h1>
        <p className="text-sm text-[#64748b]">
          You are viewing the tenant-scoped dashboard for <span className="font-medium">{tenant.code}</span>. Regular
          users can only access their own tenant, while superadmins can view any tenant via the{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/t/&lt;slug&gt;/dashboard</code> path or matching
          subdomain.
        </p>
      </div>
    </div>
  )
}

