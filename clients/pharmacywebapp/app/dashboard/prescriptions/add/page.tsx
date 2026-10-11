import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AddPrescriptionForm from "@/features/prescriptions/components/add-prescription-form"
import { FilePlus2 } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function AddPrescriptionPage() {
  const user = (await getDotnetSession())?.user ?? null

  if (!user) {
    return redirect("/?auth=signin")
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="New prescription"
          description="Record the patient, prescriber and each prescribed medicine with its dosage."
          icon={FilePlus2}
          backHref="/dashboard/prescriptions"
          backLabel="Prescriptions"
        />

        <Section spacing="lg">
          <AddPrescriptionForm />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
