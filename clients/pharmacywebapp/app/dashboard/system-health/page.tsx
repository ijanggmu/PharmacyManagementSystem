import { redirect } from "next/navigation"
import { HeartPulse } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { SystemHealthView } from "@/features/system-health/components/system-health-view"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

export const metadata = { title: "System health" }

// Same claim names the backend endpoints enforce (no legacy permission mapping exists for these).
const TENANTS_VIEW = "Permissions.Tenants.View" // /system/jobs, /system/migration-status (root-only)
const IRD_VIEW = "Permissions.Sales.Ird.View" // /sales/reports/ird-health

export default async function SystemHealthPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams
  const initialTab = Array.isArray(tab) ? tab[0] : tab
  const user = (await getDotnetSession())?.user ?? null
  if (!user) redirect("/?auth=signin")

  const permissions = user.permissions ?? []
  const isRoot = isDotnetRootUser(permissions)
  const canViewPlatform = isRoot || permissions.includes(TENANTS_VIEW)
  const canViewIrd = isRoot || permissions.includes(IRD_VIEW)
  if (!canViewPlatform && !canViewIrd) redirect("/dashboard")

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="System health"
          icon={HeartPulse}
          description={
            canViewPlatform
              ? "Live status of the API, every module database, cache, background jobs, migrations and the IRD queue."
              : "Live status of the API and the IRD invoice submission queue."
          }
        />
        <SystemHealthView canViewPlatform={canViewPlatform} canViewIrd={canViewIrd} initialTab={initialTab} />
      </PageContainer>
    </DashboardLayout>
  )
}
