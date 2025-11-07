"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
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
import DateRangePicker from "@/components/date-range-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, TrendingUp, Package, Users, Download, Calendar } from "lucide-react"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { useToast } from "@/hooks/use-toast"

interface DateRange {
  from: Date
  to: Date
}

export default function ReportsPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  })
  const [salesData, setSalesData] = useState<any[]>([])
  const [inventoryData, setInventoryData] = useState<any[]>([])
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [topProductsData, setTopProductsData] = useState<any[]>([])
  const [customersData, setCustomersData] = useState<any[]>([])
  const [prescriptionsData, setPrescriptionsData] = useState<any[]>([])
  const { toast } = useToast()

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/auth/login"
        return
      }
      setUser(user)
      setIsLoading(false)
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (!user) return
    fetchReportData()
  }, [user, dateRange])

  const fetchReportData = async () => {
    if (!dateRange) return

    const supabase = createClient()
    setIsLoading(true)

    try {
      const [salesResult, inventoryResult, revenueResult, topProductsResult, customersResult, prescriptionsResult] = await Promise.all([
        // Sales over time
        supabase
          .from("sales")
          .select("sale_date, total_amount")
          .gte("sale_date", dateRange.from.toISOString())
          .lte("sale_date", dateRange.to.toISOString())
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
          .gte("sale_date", dateRange.from.toISOString())
          .lte("sale_date", dateRange.to.toISOString()),

        // Top selling products
        supabase
          .from("sale_items")
          .select(`
            quantity,
            total_price,
            medicines (name, strength, form),
            sales!inner (sale_date)
          `)
          .gte("sales.sale_date", dateRange.from.toISOString())
          .lte("sales.sale_date", dateRange.to.toISOString()),

        // Customers
        supabase
          .from("customers")
          .select("*")
          .order("created_at", { ascending: false }),

        // Prescriptions
        supabase
          .from("prescriptions")
          .select(`
            *,
            customers (first_name, last_name),
            medicines (name)
          `)
          .gte("prescribed_date", dateRange.from.toISOString())
          .lte("prescribed_date", dateRange.to.toISOString())
      ])

      setSalesData(salesResult.data || [])
      setInventoryData(inventoryResult.data || [])
      setRevenueData(revenueResult.data || [])
      setTopProductsData(topProductsResult.data || [])
      setCustomersData(customersResult.data || [])
      setPrescriptionsData(prescriptionsResult.data || [])

    } catch (error) {
      console.error("Error fetching report data:", error)
      toast({
        title: "Error",
        description: "Failed to load report data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportReports = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get user details
      let exportedBy = user?.email || 'Unknown User'
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", user.id)
          .single()
        if (userData?.full_name) {
          exportedBy = `${userData.full_name} (${userData.email || user.email})`
        }
      }

      const dateRangeStr = dateRange 
        ? `${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}`
        : 'All Time'
      
      const documentName = `Pharmacy Reports - ${dateRangeStr}`
      const filename = `pharmacy_reports_${dateRange ? `${dateRange.from.toISOString().split('T')[0]}_to_${dateRange.to.toISOString().split('T')[0]}` : 'all_time'}`
      
      exportToExcel({
        medicines: inventoryData,
        sales: revenueData,
        customers: customersData,
        prescriptions: prescriptionsData
      }, filename, {
        exportedBy,
        exportedDate: new Date().toLocaleString(),
        documentName,
        dateRange: dateRangeStr,
        pharmacyName: 'Pharmacy Management System'
      })

      toast({
        title: "Export successful",
        description: "Report data has been exported to Excel",
      })
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export report data",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading reports...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

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
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <Button variant="outline" onClick={handleExportReports}>
              <Download className="h-4 w-4 mr-2" />
              Export Reports
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <RevenueMetrics salesData={revenueData} />

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
                  <CardDescription>
                    Daily sales {dateRange ? `from ${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}` : 'over time'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SalesChart data={salesData} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>Revenue breakdown by payment method</CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentMethodChart data={revenueData} />
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
                  <InventoryChart data={inventoryData} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Low Stock Alert</CardTitle>
                  <CardDescription>Items requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <LowStockTable data={inventoryData} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Selling Products</CardTitle>
                  <CardDescription>Best performing items in the selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  <TopProducts data={topProductsData} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Category Performance</CardTitle>
                  <CardDescription>Sales by product category</CardDescription>
                </CardHeader>
                <CardContent>
                  <CategoryChart data={inventoryData} />
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
