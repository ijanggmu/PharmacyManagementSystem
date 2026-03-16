import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedNewSaleForm from "@/components/enhanced-new-sale-form"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PageContainer, PageHeader, Section } from "@/components/layouts"

export default async function NewSalePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect("/auth/login")
  }

  // Get customers, medicines, and prescriptions for the form
  const [customersResult, medicinesResult, prescriptionsResult] = await Promise.all([
    supabase.from("customers").select("id, first_name, last_name, phone").order("first_name"),
    supabase
      .from("medicines")
      .select("id, name, generic_name, strength, form, unit_price, stock_quantity, categories(id, name)")
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
      <PageContainer>
        <PageHeader
          title="Point of Sale"
          description="Process sales transactions with advanced features"
          actions={
            <Button variant="outline" size="icon" asChild>
              <Link href="/dashboard/sales">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          }
        />

        <Section spacing="lg">
          <EnhancedNewSaleForm
            customers={customersResult.data || []}
            medicines={medicinesResult.data || []}
            prescriptions={prescriptionsResult.data || []}
            currentUser={user}
          />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
