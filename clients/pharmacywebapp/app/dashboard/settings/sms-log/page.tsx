import { redirect } from "next/navigation"
import { MessageSquare } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import SmsLog from "@/features/sms/components/sms-log"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { canViewSmsLog, dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"

export default async function SmsLogPage() {
  const user = (await getDotnetSession())?.user ?? null
  if (!user) {
    return redirect("/?auth=signin")
  }

  // GET /notifications/sms/messages requires Customers.Ledger.RecordPayment (customers' phones and dues);
  // retrying needs Reference.Settings.Update.
  const permissions = user.permissions ?? []
  if (!canViewSmsLog(permissions)) {
    redirect("/dashboard")
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="SMS log"
          description="Every SMS the pharmacy sent or tried to send: reminders, receipts and tests, with the provider's answer."
          icon={MessageSquare}
        />
        <SmsLog canRetry={dotnetPermissionAllowed("settings:write", permissions)} />
      </PageContainer>
    </DashboardLayout>
  )
}
