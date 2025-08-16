import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import SalesTable from "@/components/sales-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, ShoppingCart, DollarSign, CreditCard, Receipt } from "lucide-react"
import Link from "next/link"
import { Sale } from "@/lib/types"

export default async function SalesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get sales with customer and sale items information
  const { data: sales, error } = await supabase
    .from("sales")
    .select(`
      *,
      customers (first_name, last_name, phone),
      sale_items (
        id,
        quantity,
        unit_price,
        total_price,
        medicines (name, strength, form)
      )
    `)
    .order("sale_date", { ascending: false })

  if (error) {
    console.error("Error fetching sales:", error)
    throw new Error("Failed to load sales data. Please try again later.")
  }

  const totalSales = sales?.length || 0
  const todaysSales =
    sales?.filter((sale: Sale) => {
      const saleDate = new Date(sale.created_at)
      const today = new Date()
      return saleDate.toDateString() === today.toDateString()
    }).length || 0

  const totalRevenue = sales?.reduce((sum: number, sale: Sale) => sum + Number.parseFloat(sale.total_amount), 0) || 0
  const todaysRevenue =
    sales
      ?.filter((sale: Sale) => {
        const saleDate = new Date(sale.created_at)
        const today = new Date()
        return saleDate.toDateString() === today.toDateString()
      })
      .reduce((sum: number, sale: Sale) => sum + Number.parseFloat(sale.total_amount), 0) || 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sales & Billing</h1>
            <p className="text-gray-600">Process sales and manage transactions</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/sales/new">
              <Plus className="h-4 w-4 mr-2" />
              New Sale
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSales}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
              <Receipt className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todaysSales}</div>
              <p className="text-xs text-muted-foreground">Transactions today</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
              <CreditCard className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${todaysRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Revenue today</p>
            </CardContent>
          </Card>
        </div>

        {/* Sales List */}
        <Card>
          <CardHeader>
            <CardTitle>Sales History</CardTitle>
            <CardDescription>View and manage all sales transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search sales..." className="pl-10" />
              </div>
              <Button variant="outline">Filter by Date</Button>
            </div>

            <SalesTable sales={sales || []} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
