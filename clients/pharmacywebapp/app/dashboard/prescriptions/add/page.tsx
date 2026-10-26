import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AddPrescriptionForm from "@/features/prescriptions/components/add-prescription-form"
import { FilePlus2 } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

/** The doctors' desk opens this page for a token: ?appointmentId=&customerId=&doctorName=&doctorLicense= */
export default async function AddPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = (await getDotnetSession())?.user ?? null

  if (!user) {
    return redirect("/?auth=signin")
  }

  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return typeof value === "string" && value.trim() !== "" ? value : undefined
  }
  const appointmentId = one("appointmentId")

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="New prescription"
          description="Record the patient, prescriber and each prescribed medicine with its dosage."
          icon={FilePlus2}
          backHref={appointmentId ? "/dashboard/appointments" : "/dashboard/prescriptions"}
          backLabel={appointmentId ? "Appointments" : "Prescriptions"}
        />

        <Section spacing="lg">
          <AddPrescriptionForm
            appointmentId={appointmentId}
            initial={{ customerId: one("customerId"), doctorName: one("doctorName"), doctorLicense: one("doctorLicense") }}
          />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
