import { redirect } from "next/navigation"
import { Stethoscope } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader } from "@/components/layouts"
import { DoctorsList } from "@/features/appointments/components/doctors-list"
import { canManageDoctors, canViewDoctors } from "@/features/appointments/lib/appointments-permissions"
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
        <DoctorsList canManage={canManageDoctors(permissions)} />
      </PageContainer>
    </DashboardLayout>
  )
}
