import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AddPrescriptionForm from "@/features/prescriptions/components/add-prescription-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { backendTarget } from "@/lib/api/backend-target"
import { getDotnetSession } from "@/lib/api/dotnet-server-session"

export default async function AddPrescriptionPage() {
  const user = backendTarget("AUTH") === "dotnet"
    ? ((await getDotnetSession())?.user ?? null)
    : (await (await (await import("@/lib/supabase/server")).createClient()).auth.getUser()).data.user

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
