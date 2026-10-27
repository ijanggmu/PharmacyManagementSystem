import { redirect } from "next/navigation"
import { Stethoscope } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { AppointmentsTabs } from "@/features/appointments/components/appointments-tabs"
import { DoctorsList } from "@/features/appointments/components/doctors-list"
import { OnlineBookingCard } from "@/features/appointments/components/online-booking-card"
import { canManageDoctors, canViewAppointments, canViewDoctors } from "@/features/appointments/lib/appointments-permissions"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"
import { getTranslations } from "@/lib/i18n/server"

export default async function DoctorsPage() {
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
        <PageHeader title={t("doctors.title")} description={t("doctors.description")} icon={Stethoscope} />
        <AppointmentsTabs show={{ today: canViewAppointments(permissions), timetable: canViewDoctors(permissions), doctors: canViewDoctors(permissions) }} />
        <div className="space-y-4">
          <DoctorsList canManage={canManageDoctors(permissions)} />
          {user.tenantId && <OnlineBookingCard pharmacyCode={user.tenantId} canManage={canManageDoctors(permissions)} />}
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
