import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import SalesChart from "@/components/sales-chart"
import InventoryChart from "@/components/inventory-chart"
import RevenueMetrics from "@/components/revenue-metrics"
import TopProducts from "@/components/top-products"
import PaymentMethodChart from "@/components/payment-method-chart"
import LowStockTable from "@/components/low-stock-table"
import CategoryChart from "@/components/category-chart"
import CustomerGrowthChart from "@/components/customer-growth-chart"
import CustomerInsights from "@/components/customer-insights"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, TrendingUp, Package, Users, Download } from "lucide-react"

export default async function ReportsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get sales data for the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [salesData, inventoryData, revenueData, topProductsData] = await Promise.all([
    // Sales over time
    supabase
      .from("sales")
      .select("sale_date, total_amount")
      .gte("sale_date", thirtyDaysAgo.toISOString())
      .order("sale_date"),

    // Inventory status
    supabase
      .from("medicines")
      .select("name, stock_quantity, minimum_stock, unit_price, categories(name)")
      .order("stock_quantity", { ascending: false }),

    // Revenue metrics
    supabase
      .from("sales")
      .select("total_amount, sale_date, payment_method")
      .gte("sale_date", thirtyDaysAgo.toISOString()),

    // Top selling products
    supabase
      .from("sale_items")
      .select(`
        quantity,
        total_price,
        medicines (name, strength, form),
        sales!inner (sale_date)
      `)
      .gte("sales.sale_date", thirtyDaysAgo.toISOString()),
  ])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-600">Business insights and performance metrics</p>
          </div>
          <div className="flex items-center gap-2">
            <Select defaultValue="30days">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
                <SelectItem value="1year">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <RevenueMetrics salesData={revenueData.data || []} />

        {/* Analytics Tabs */}
        <Tabs defaultValue="sales" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Customers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sales Trend</CardTitle>
                  <CardDescription>Daily sales over the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <SalesChart data={salesData.data || []} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>Revenue breakdown by payment method</CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentMethodChart data={revenueData.data || []} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Stock Levels</CardTitle>
                  <CardDescription>Current inventory status</CardDescription>
                </CardHeader>
                <CardContent>
                  <InventoryChart data={inventoryData.data || []} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Low Stock Alert</CardTitle>
                  <CardDescription>Items requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <LowStockTable data={inventoryData.data || []} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Selling Products</CardTitle>
                  <CardDescription>Best performing items this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <TopProducts data={topProductsData.data || []} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Category Performance</CardTitle>
                  <CardDescription>Sales by product category</CardDescription>
                </CardHeader>
                <CardContent>
                  <CategoryChart data={inventoryData.data || []} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Customer Growth</CardTitle>
                  <CardDescription>New customer registrations over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <CustomerGrowthChart />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Customer Insights</CardTitle>
                  <CardDescription>Key customer metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <CustomerInsights />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
