import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AddPrescriptionForm from "@/components/add-prescription-form"
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
    return redirect("/auth/login")
  }

  // Get customers and medicines for the form
  const [customersResult, medicinesResult] = await Promise.all([
    supabase.from("customers").select("id, first_name, last_name, phone").order("first_name"),
    supabase
      .from("medicines")
      .select("id, name, generic_name, strength, form, prescription_required")
      .eq("prescription_required", true)
      .order("name"),
  ])

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
              <AddPrescriptionForm customers={customersResult.data || []} medicines={medicinesResult.data || []} />
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
