import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isSuperAdmin } from "@/lib/api/dotnet-session"
import { TenantManagement } from "@/features/tenants/components/tenant-management"

export default async function TenantsPage() {
  const session = await getDotnetSession()
  if (!session) redirect("/?auth=signin")
  if (!isSuperAdmin(session.user)) redirect("/dashboard")

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Tenants"
          description="Provision pharmacies on this platform and monitor their status and subscription."
          icon={Building2}
        />
        <Section spacing="lg">
          <TenantManagement />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
