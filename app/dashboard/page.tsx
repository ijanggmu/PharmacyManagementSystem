import { createClient } from "@/lib/supabase/server"
import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Pill,
  Users,
  FileText,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Clock,
  Package,
  ShoppingCart,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Medicine, Customer, Prescription, Sale } from "@/lib/types"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const currentDate = new Date()
  const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Get comprehensive dashboard statistics
  const [medicinesResult, customersResult, prescriptionsResult, salesResult, todaySalesResult, recentSalesResult] =
    await Promise.all([
      supabase.from("medicines").select("id, name, stock_quantity, minimum_stock, expiry_date, unit_price"),
      supabase.from("customers").select("id, created_at"),
      supabase.from("prescriptions").select("id, status, created_at"),
      supabase
        .from("sales")
        .select("id, total_amount, sale_date")
        .gte("sale_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("sales").select("id, total_amount").gte("sale_date", new Date().toISOString().split("T")[0]),
      supabase
        .from("sales")
        .select("id, total_amount, sale_date, customers(first_name, last_name)")
        .order("sale_date", { ascending: false })
        .limit(5),
    ])

  const medicines = medicinesResult.data || []
  const customers = customersResult.data || []
  const prescriptions = prescriptionsResult.data || []
  const sales = salesResult.data || []
  const todaySales = todaySalesResult.data || []
  const recentSales = recentSalesResult.data || []

  // Calculate metrics
  const lowStockMedicines = medicines.filter((med: Medicine) => med.stock_quantity <= med.minimum_stock)
  const pendingPrescriptions = prescriptions.filter((p: Prescription) => p.status === "pending")
  const monthlyRevenue = sales.reduce((sum: number, sale: Sale) => sum + Number.parseFloat(sale.total_amount), 0)
  const todayRevenue = todaySales.reduce((sum: number, sale: Sale) => sum + Number.parseFloat(sale.total_amount), 0)

  const expiringMedicines = medicines.filter((med: Medicine) => {
    if (!med.expiry_date) return false
    const expiryDate = new Date(med.expiry_date)
    return expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
  })

  const totalInventoryValue = medicines.reduce(
    (sum: number, med: Medicine) => sum + med.stock_quantity * Number.parseFloat(med.unit_price),
    0,
  )

  // Recent customers (last 7 days)
  const recentCustomers = customers.filter((customer: Customer) => {
    const customerDate = new Date(customer.created_at)
    const sevenDaysAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    return customerDate >= sevenDaysAgo
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-600">Welcome back! Here's your pharmacy's performance at a glance.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Medicines</CardTitle>
              <Pill className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{medicines.length}</div>
              <p className="text-xs text-muted-foreground">Active inventory items</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground">Registered customers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Prescriptions</CardTitle>
              <FileText className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingPrescriptions.length}</div>
              <p className="text-xs text-muted-foreground">Awaiting fulfillment</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${todayRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Monthly: ${monthlyRevenue.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Stock Alert */}
          {lowStockMedicines.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  Low Stock Alert
                </CardTitle>
                <CardDescription className="text-red-600">
                  {lowStockMedicines.length} items need restocking
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {lowStockMedicines.slice(0, 3).map((medicine: Medicine) => (
                    <div key={medicine.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                      <span className="text-sm font-medium">{medicine.name}</span>
                      <Badge variant="destructive" className="text-xs">
                        {medicine.stock_quantity} left
                      </Badge>
                    </div>
                  ))}
                  {lowStockMedicines.length > 3 && (
                    <Button variant="outline" size="sm" asChild className="w-full mt-2 bg-transparent">
                      <Link href="/dashboard/inventory">
                        View All {lowStockMedicines.length} Items
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expiring Medicines */}
          {expiringMedicines.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <Clock className="h-5 w-5" />
                  Expiring Medicines
                </CardTitle>
                <CardDescription className="text-orange-600">
                  {expiringMedicines.length} items expire within 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {expiringMedicines.slice(0, 3).map((medicine: Medicine) => {
                    const daysUntilExpiry = Math.ceil(
                      (new Date(medicine.expiry_date).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
                    )
                    return (
                      <div key={medicine.id} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                        <div>
                          <span className="text-sm font-medium">{medicine.name}</span>
                          <div className="text-xs text-gray-500">
                            {new Date(medicine.expiry_date).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant={daysUntilExpiry <= 7 ? "destructive" : "secondary"} className="text-xs">
                          {daysUntilExpiry}d
                        </Badge>
                      </div>
                    )
                  })}
                  <Button variant="outline" size="sm" asChild className="w-full mt-2 bg-transparent">
                    <Link href="/dashboard/inventory">
                      View All Expiring Items
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Recent Sales
              </CardTitle>
              <CardDescription>Latest transactions and revenue</CardDescription>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <p className="text-sm text-gray-500">No recent sales</p>
              ) : (
                <div className="space-y-3">
                  {recentSales.map((sale: Sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <div className="text-sm font-medium">
                          {sale.customers
                            ? `${sale.customers.first_name} ${sale.customers.last_name}`
                            : "Walk-in Customer"}
                        </div>
                        <div className="text-xs text-gray-500">{new Date(sale.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="text-lg font-bold text-green-600">
                        ${Number.parseFloat(sale.total_amount).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" asChild className="w-full bg-transparent">
                    <Link href="/dashboard/sales">
                      View All Sales
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Quick Actions
              </CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-start">
                <Link href="/dashboard/sales/new">
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  New Sale
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                <Link href="/dashboard/inventory/add">
                  <Package className="h-4 w-4 mr-2" />
                  Add Medicine
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                <Link href="/dashboard/prescriptions/add">
                  <FileText className="h-4 w-4 mr-2" />
                  New Prescription
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                <Link href="/dashboard/customers/add">
                  <Users className="h-4 w-4 mr-2" />
                  Add Customer
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
