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
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, TrendingUp, Package, Users, Download, Calendar } from "lucide-react"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { useToast } from "@/hooks/use-toast"
import { useSystemSettingsMap } from "@/lib/hooks/use-system-settings"

interface DateRange {
  from: Date
  to: Date
}

export default function ReportsPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>("sales")
  const { data: settings } = useSystemSettingsMap()
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
      
      // Export only the selected tab's data
      let exportData: any = {}
      let moduleName = ""
      
      switch (activeTab) {
        case "sales":
          exportData = { sales: revenueData }
          moduleName = "Sales"
          break
        case "inventory":
          exportData = { medicines: inventoryData }
          moduleName = "Inventory"
          break
        case "products":
          exportData = { medicines: inventoryData, topProducts: topProductsData }
          moduleName = "Products"
          break
        case "customers":
          exportData = { customers: customersData }
          moduleName = "Customers"
          break
        default:
          exportData = {
            medicines: inventoryData,
            sales: revenueData,
            customers: customersData,
            prescriptions: prescriptionsData
          }
          moduleName = "All"
      }
      
      const documentName = `${moduleName} Report - ${dateRangeStr}`
      const filename = `${moduleName.toLowerCase()}_report_${dateRange ? `${dateRange.from.toISOString().split('T')[0]}_to_${dateRange.to.toISOString().split('T')[0]}` : 'all_time'}`
      
      exportToExcel(exportData, filename, {
        exportedBy,
        exportedDate: new Date().toLocaleString(),
        documentName,
        dateRange: dateRangeStr,
        pharmacyName: settings?.pharmacy_name || 'Pharmacy Management System'
      })

      toast({
        title: "Export successful",
        description: `${moduleName} report has been exported to Excel`,
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
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
            <TabsTrigger value="compliance" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Compliance
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

          <TabsContent value="compliance" className="space-y-6">
            <ComplianceReportsTab dateRange={dateRange} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

// Compliance Reports Component
function ComplianceReportsTab({ dateRange }: { dateRange: DateRange | undefined }) {
  const [reportType, setReportType] = useState<string>("dea")
  const [reportData, setReportData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (dateRange) {
      fetchComplianceReport()
    }
  }, [reportType, dateRange])

  const fetchComplianceReport = async () => {
    if (!dateRange) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        type: reportType,
        startDate: dateRange.from.toISOString().split("T")[0],
        endDate: dateRange.to.toISOString().split("T")[0],
      })

      const response = await fetch(`/api/reports/compliance?${params}`)
      if (!response.ok) throw new Error("Failed to fetch compliance report")

      const data = await response.json()
      setReportData(data.data)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load compliance report",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportComplianceReport = async () => {
    if (!reportData) return

    try {
      const exportData = {
        [reportType]: reportData,
      }
      const filename = `${reportType}_compliance_report_${dateRange ? `${dateRange.from.toISOString().split('T')[0]}_to_${dateRange.to.toISOString().split('T')[0]}` : 'all_time'}`

      exportToExcel(exportData, filename, {
        exportedBy: "System",
        exportedDate: new Date().toLocaleString(),
        documentName: `${reportData.reportType} - ${dateRange ? `${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}` : 'All Time'}`,
        dateRange: dateRange ? `${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}` : 'All Time',
        pharmacyName: 'Pharmacy Management System'
      })

      toast({
        title: "Export successful",
        description: "Compliance report has been exported to Excel",
      })
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export compliance report",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Compliance Reports</CardTitle>
              <CardDescription>DEA, State Board, and regulatory compliance reports</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dea">DEA Report</SelectItem>
                  <SelectItem value="state-board">State Board Report</SelectItem>
                  <SelectItem value="pmp">PDMP Report</SelectItem>
                  <SelectItem value="inventory">Inventory Discrepancy</SelectItem>
                  <SelectItem value="audit">Audit Trail</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportComplianceReport} disabled={!reportData}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading compliance report...</p>
              </div>
            </div>
          ) : reportData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(reportData.summary || {}).map(([key, value]) => {
                  const displayValue = typeof value === 'object' && value !== null 
                    ? JSON.stringify(value) 
                    : value != null 
                    ? String(value) 
                    : 'N/A'
                  return (
                    <div key={key} className="p-4 border rounded-lg">
                      <p className="text-sm text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-2xl font-bold">{displayValue}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Report Details</h3>
                <div className="border rounded-lg p-4 max-h-96 overflow-auto">
                  <pre className="text-sm">{JSON.stringify(reportData, null, 2)}</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select a report type and date range to generate compliance report
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
