import { redirect } from "next/navigation"
import { ClipboardList } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { AppointmentsDesk } from "@/features/appointments/components/appointments-desk"
import { AppointmentsTabs } from "@/features/appointments/components/appointments-tabs"
import { canViewAppointments, canViewDoctors, deskAccess } from "@/features/appointments/lib/appointments-permissions"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { getTranslations } from "@/lib/i18n/server"
import { isValidYmd } from "@/lib/utils/date-limits"

/** The doctors' desk. ?date=yyyy-MM-dd opens another day (the timetable links here). */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = (await getDotnetSession())?.user ?? null
  if (!user) {
    return redirect("/?auth=signin")
  }

  const permissions = user.permissions ?? []
  if (!canViewAppointments(permissions)) {
    // The menu's one "Appointments" item lands here; someone who only sees the doctors gets their tab.
    redirect(canViewDoctors(permissions) ? "/dashboard/appointments/timetable" : "/dashboard")
  }

  const { date } = await searchParams
  const t = await getTranslations("appointments")
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader title={t("desk.title")} description={t("desk.description")} icon={ClipboardList} />
        <AppointmentsTabs show={{ today: canViewAppointments(permissions), timetable: canViewDoctors(permissions), doctors: canViewDoctors(permissions) }} />
        <AppointmentsDesk access={deskAccess(permissions)} initialDate={typeof date === "string" && isValidYmd(date) ? date : undefined} />
      </PageContainer>
    </DashboardLayout>
  )
}
