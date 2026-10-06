import { redirect, notFound } from "next/navigation"
import { backendTarget } from "@/lib/api/backend-target"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TenantLoginPage({ params }: PageProps) {
  const { slug } = await params
  const pharmacyCode = decodeURIComponent(slug).trim().toLowerCase()

  if (!pharmacyCode) {
    notFound()
  }

  let authed = false
  if (backendTarget("AUTH") === "dotnet") {
    // Tenant resolution on the .NET path is done by the BFF from the host (tenantForHost); there is
    // no tenant-existence lookup here yet, so an unknown code is not rejected at this step.
    authed = (await getDotnetSession()) !== null
  } else {
    const { createServiceClient } = await import("@/lib/supabase/service")
    const { createClient } = await import("@/lib/supabase/server")
    try {
      const admin = createServiceClient()
      const { data: tenant, error } = await admin
        .from("tenants")
        .select("id, code, is_active")
        .eq("code", pharmacyCode)
        .maybeSingle()

      if (error || !tenant) {
        notFound()
      }

      if (!tenant.is_active) {
        notFound()
      }
    } catch {
      notFound()
    }

    const supabase = await createClient()
    authed = !!(await supabase.auth.getUser()).data?.user
  }

  if (authed) {
    redirect("/dashboard")
  }

  redirect(`/?auth=signin&code=${encodeURIComponent(pharmacyCode)}`)
}
