import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TenantLoginPage({ params }: PageProps) {
  const { slug } = await params
  const pharmacyCode = decodeURIComponent(slug).trim().toLowerCase()

  if (!pharmacyCode) {
    notFound()
  }

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
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    redirect("/dashboard")
  }

  redirect(`/?auth=signin&code=${encodeURIComponent(pharmacyCode)}`)
}
