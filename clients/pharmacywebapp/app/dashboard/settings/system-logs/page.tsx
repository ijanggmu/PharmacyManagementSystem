import { redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import SystemLogsView from "@/features/settings/components/system-logs-view"
import { isSystemLogTab } from "@/features/settings/components/system-logs/tabs"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

const AUDIT_VIEW = "Permissions.AuditTrails.View"
const AUDIT_CROSS_TENANT = "Permissions.AuditTrails.ViewCrossTenant"
const IRD_VIEW = "Permissions.Sales.Ird.View"

export default async function SystemLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = (await getDotnetSession())?.user ?? null

  if (!user) {
    return redirect("/?auth=signin")
  }

  // Every endpoint behind this page requires Permissions.AuditTrails.View (there is no legacy
  // permission mapping for audit trails, so check the .NET claim directly). Root holds everything.
  const permissions = user.permissions ?? []
  const isRoot = isDotnetRootUser(permissions)
  const has = (name: string) => isRoot || permissions.includes(name)
  if (!has(AUDIT_VIEW)) {
    redirect("/dashboard")
  }

  const tabParam = (await searchParams).tab
  const tab = typeof tabParam === "string" && isSystemLogTab(tabParam) ? tabParam : "requests"

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="System logs"
          description="Every API request, error, sign-in and integration event the system recorded — click any row for full details and related events."
          icon={ShieldAlert}
        />
        <SystemLogsView initialTab={tab} canViewCrossTenant={has(AUDIT_CROSS_TENANT)} canViewIrd={has(IRD_VIEW)} />
      </PageContainer>
    </DashboardLayout>
  )
}
