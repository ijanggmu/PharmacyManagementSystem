import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isSuperAdmin } from "@/lib/api/dotnet-session"
import { TenantDetail } from "@/features/tenants/components/tenant-detail"

export default async function TenantOverviewPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await getDotnetSession()
  if (!session) redirect("/?auth=signin")
  if (!isSuperAdmin(session.user)) redirect("/dashboard")

  const { tenantId } = await params

  return (
    <DashboardLayout>
      <PageContainer maxWidth="lg">
        <PageHeader
          title="Tenant overview"
          description="Subscription, provisioning status and users for this pharmacy."
          icon={Building2}
          actions={
            <Button variant="outline" asChild>
              <Link href="/dashboard/tenants">
                <ArrowLeft aria-hidden />
                All tenants
              </Link>
            </Button>
          }
        />
        <Section spacing="lg">
          <TenantDetail tenantId={tenantId} />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
