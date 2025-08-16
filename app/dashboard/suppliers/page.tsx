import { Suspense } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CheckCircle, AlertCircle, TrendingUp } from "lucide-react"
import SupplierTable from "@/components/supplier-table"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/server"

async function getSuppliers() {
  const supabase = await createClient()
  const { data: suppliers, error } = await supabase.from("suppliers").select("*").order("name")

  if (error) {
    console.error("Error fetching suppliers:", error)
    return []
  }

  return suppliers || []
}

async function getSupplierStats() {
  const supabase = createClient()

  const { data: suppliers } = await supabase.from("suppliers").select("*")
  const totalSuppliers = suppliers?.length || 0

  const activeSuppliers = suppliers?.filter((s) => s.email && s.phone && s.contact_person).length || 0
  const incompleteSuppliers = totalSuppliers - activeSuppliers

  return {
    total: totalSuppliers,
    active: activeSuppliers,
    incomplete: incompleteSuppliers,
    growth: 12, // Mock growth percentage
  }
}

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()
  const stats = await getSupplierStats()

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Suppliers</h1>
            <p className="text-gray-600">Manage your medicine suppliers</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">All registered suppliers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <p className="text-xs text-muted-foreground">Complete information</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Incomplete</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.incomplete}</div>
              <p className="text-xs text-muted-foreground">Missing information</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">+{stats.growth}%</div>
              <p className="text-xs text-muted-foreground">From last month</p>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white rounded-lg border">
          <Suspense fallback={<div>Loading suppliers...</div>}>
            <SupplierTable suppliers={suppliers} />
          </Suspense>
        </div>
      </div>
    </DashboardLayout>
  )
}
