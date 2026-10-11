import { redirect, notFound } from "next/navigation"
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

  // Tenant resolution on the .NET path is done by the BFF from the host (tenantForHost); there is
  // no tenant-existence lookup here yet, so an unknown code is not rejected at this step.
  const authed = (await getDotnetSession()) !== null

  if (authed) {
    redirect("/dashboard")
  }

  redirect(`/?auth=signin&code=${encodeURIComponent(pharmacyCode)}`)
}
