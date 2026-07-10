import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AddPrescriptionForm from "@/features/prescriptions/components/add-prescription-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PageContainer, PageHeader, Section } from "@/components/layouts"

export default async function AddPrescriptionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect("/?auth=signin")
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Add New Prescription"
          description="Create a new prescription order"
          actions={
            <Button variant="outline" size="icon" asChild>
              <Link href="/dashboard/prescriptions">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          }
        />

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Prescription Details</CardTitle>
              <CardDescription>Enter prescription information and medication details</CardDescription>
            </CardHeader>
            <CardContent>
              <AddPrescriptionForm />
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
