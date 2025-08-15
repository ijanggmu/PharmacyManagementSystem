import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedNewSaleForm from "@/components/enhanced-new-sale-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function NewSalePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get customers, medicines, and prescriptions for the form
  const [customersResult, medicinesResult, prescriptionsResult] = await Promise.all([
    supabase.from("customers").select("id, first_name, last_name, phone").order("first_name"),
    supabase
      .from("medicines")
      .select("id, name, generic_name, strength, form, unit_price, stock_quantity")
      .gt("stock_quantity", 0)
      .order("name"),
    supabase
      .from("prescriptions")
      .select(`
        id, 
        prescription_number, 
        customers (first_name, last_name),
        prescription_items (
          id,
          quantity_prescribed,
          quantity_dispensed,
          medicines (id, name, strength, form, unit_price)
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard/sales">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Point of Sale
            </h1>
            <p className="text-gray-600">Process sales transactions with advanced features</p>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-6xl">
          <Card>
            <CardHeader>
              <CardTitle>Point of Sale</CardTitle>
              <CardDescription>Add items to cart and process payment</CardDescription>
            </CardHeader>
            <CardContent>
              <EnhancedNewSaleForm
                customers={customersResult.data || []}
                medicines={medicinesResult.data || []}
                prescriptions={prescriptionsResult.data || []}
                currentUser={user}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
