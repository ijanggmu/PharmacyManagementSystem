import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import MigrationStatusChecker from "@/features/settings/components/migration-status-checker"
import { backendTarget } from "@/lib/api/backend-target"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function MigrationsPage() {
  const user = backendTarget("AUTH") === "dotnet"
    ? ((await getDotnetSession())?.user ?? null)
    : (await (await (await import("@/lib/supabase/server")).createClient()).auth.getUser()).data.user

  if (!user) {
    return redirect("/?auth=signin")
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Database Migration Status</h1>
        <MigrationStatusChecker />
      </div>
    </DashboardLayout>
  )
}

