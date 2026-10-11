import { redirect } from "next/navigation"
import { CreditCard } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isSuperAdmin } from "@/lib/api/dotnet-session"
import { BillingAdminTabs } from "@/features/tenants/components/billing-admin-tabs"

export default async function TenantsBillingPage() {
  const session = await getDotnetSession()
  if (!session) redirect("/?auth=signin")
  if (!isSuperAdmin(session.user)) redirect("/dashboard")

  return (
    <DashboardLayout>
      <PageContainer maxWidth="lg">
        <PageHeader
          title="Billing admin"
          description="Plans, invoices and wallet top-up requests across every tenant."
          icon={CreditCard}
        />
        <Section spacing="lg">
          <BillingAdminTabs />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
