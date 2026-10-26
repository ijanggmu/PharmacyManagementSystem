import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer } from "@/components/layouts"
import { DoctorDetail } from "@/features/appointments/components/doctor-detail"
import { canManageDoctors, canViewDoctors } from "@/features/appointments/lib/appointments-permissions"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function DoctorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getDotnetSession())?.user ?? null
  if (!user) {
    return redirect("/?auth=signin")
  }

  const permissions = user.permissions ?? []
  if (!canViewDoctors(permissions)) {
    redirect("/dashboard")
  }

  const { id } = await params
  return (
    <DashboardLayout>
      <PageContainer>
        <DoctorDetail doctorId={id} canManage={canManageDoctors(permissions)} />
      </PageContainer>
    </DashboardLayout>
  )
}
