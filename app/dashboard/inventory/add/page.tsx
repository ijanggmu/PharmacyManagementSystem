import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import AddMedicineForm from "@/components/add-medicine-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function AddMedicinePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get categories and suppliers for the form
  const [categoriesResult, suppliersResult] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
  ])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/inventory">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              Add New Medicine
            </h1>
            <p className="text-gray-600">Add a new medicine to your inventory</p>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-4xl">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Medicine Information</CardTitle>
              <CardDescription>Enter the details for the new medicine</CardDescription>
            </CardHeader>
            <CardContent>
              <AddMedicineForm
                categories={categoriesResult.data || []}
                suppliers={suppliersResult.data || []}
                currentUser={user}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
