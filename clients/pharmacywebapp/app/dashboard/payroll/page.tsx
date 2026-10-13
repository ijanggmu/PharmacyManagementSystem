import { redirect } from "next/navigation"
import { BadgeDollarSign } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { PayrollWorkspace } from "@/features/payroll/components/payroll-workspace"
import { canViewPayroll } from "@/features/payroll/lib/payroll-permissions"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function PayrollPage() {
  const user = (await getDotnetSession())?.user ?? null
  if (!user) {
    return redirect("/?auth=signin")
  }

  // Every /payroll endpoint needs Payroll.View; editing, approving and posting are checked by the API.
  if (!canViewPayroll(user.permissions ?? [])) {
    redirect("/dashboard")
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Payroll"
          description="Employees, salary structures and monthly pay runs with SSF, CIT and salary TDS — posted to the books and paid from cash or bank."
          icon={BadgeDollarSign}
        />
        <PayrollWorkspace />
      </PageContainer>
    </DashboardLayout>
  )
}
