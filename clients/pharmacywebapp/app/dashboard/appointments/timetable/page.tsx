import { redirect } from "next/navigation"
import { CalendarDays } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { TimetableWeek } from "@/features/appointments/components/timetable-week"
import { canManageDoctors, canViewDoctors } from "@/features/appointments/lib/appointments-permissions"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { getTranslations } from "@/lib/i18n/server"

export default async function DoctorsTimetablePage() {
  const user = (await getDotnetSession())?.user ?? null
  if (!user) {
    return redirect("/?auth=signin")
  }

  const permissions = user.permissions ?? []
  if (!canViewDoctors(permissions)) {
    redirect("/dashboard")
  }

  const t = await getTranslations("appointments")
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader title={t("timetable.title")} description={t("timetable.description")} icon={CalendarDays} />
        <TimetableWeek canManage={canManageDoctors(permissions)} />
      </PageContainer>
    </DashboardLayout>
  )
}
