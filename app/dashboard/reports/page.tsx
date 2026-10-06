"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import SalesChart from "@/features/sales/components/sales-chart"
import InventoryChart from "@/features/medicines/components/inventory-chart"
import RevenueMetrics from "@/features/sales/components/revenue-metrics"
import TopProducts from "@/features/sales/components/top-products"
import PaymentMethodChart from "@/features/sales/components/payment-method-chart"
import LowStockTable from "@/features/medicines/components/low-stock-table"
import CategoryChart from "@/features/medicines/components/category-chart"
import CustomerGrowthChart from "@/features/customers/components/customer-growth-chart"
import CustomerInsights from "@/features/customers/components/customer-insights"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart3, TrendingUp, Package, Users, Download, Calendar } from "lucide-react"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { useToast } from "@/hooks/use-toast"
import { useSystemSettingsMap } from "@/features/settings/hooks/use-system-settings"
import { apiGet } from "@/lib/api/client-helpers"
import { getComplianceReport } from "@/lib/api/reports-api"

interface DateRange {
  from: Date
  to: Date
}

type GenericRow = Record<string, unknown>

interface ReportsOverviewPayload {
  sales: { sale_date: string; total_amount: string }[]
  inventory: {
    name: string
    stock_quantity: number
    minimum_stock: number
    unit_price: string
    categories: { name: string } | null
  }[]
  revenue: { total_amount: string; sale_date: string; payment_method: string }[]
  topProducts: GenericRow[]
  customers: GenericRow[]
  prescriptions: GenericRow[]
  exportedBy?: string
}

interface ComplianceReportPayload {
  reportType?: string
  summary?: Record<string, unknown>
  [key: string]: unknown
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function ReportsPage() {
  const [hasSession, setHasSession] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  // Initialize from ?tab= so sidebar sub-links (e.g. Reports > Compliance) land
  // directly on the right tab.
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "sales"
    const tab = new URLSearchParams(window.location.search).get("tab")
    const validTabs = ["sales", "inventory", "products", "customers", "compliance"]
    return tab && validTabs.includes(tab) ? tab : "sales"
  })
  const { data: settings } = useSystemSettingsMap()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  })
  const [salesData, setSalesData] = useState<{ sale_date: string; total_amount: string }[]>([])
  const [inventoryData, setInventoryData] = useState<
    { name: string; stock_quantity: number; minimum_stock: number; unit_price: string; categories: { name: string } | null }[]
  >([])
  const [revenueData, setRevenueData] = useState<
    { total_amount: string; sale_date: string; payment_method: string }[]
  >([])
  const [topProductsData, setTopProductsData] = useState<GenericRow[]>([])
  const [customersData, setCustomersData] = useState<GenericRow[]>([])
  const [prescriptionsData, setPrescriptionsData] = useState<GenericRow[]>([])
  const { toast } = useToast()

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setHasSession(true)
      setIsLoading(false)
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (!hasSession) return
    fetchReportData()
  }, [hasSession, dateRange])

  const fetchReportData = async () => {
    if (!dateRange) return

    setIsLoading(true)

    try {
      const query = new URLSearchParams({
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      })
      const data = await apiGet<ReportsOverviewPayload>(`/api/reports/overview?${query.toString()}`)
      setSalesData(data?.sales || [])
      setInventoryData(data?.inventory || [])
      setRevenueData(data?.revenue || [])
      setTopProductsData(data?.topProducts || [])
      setCustomersData(data?.customers || [])
      setPrescriptionsData(data?.prescriptions || [])

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
      let exportedBy = "Current User"

      const dateRangeStr = dateRange 
        ? `${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}`
        : 'All Time'

      const query = new URLSearchParams({
        from: dateRange?.from.toISOString() || new Date(0).toISOString(),
        to: dateRange?.to.toISOString() || new Date().toISOString(),
        full: "1",
      })
      const fullData = await apiGet<ReportsOverviewPayload>(`/api/reports/overview?${query.toString()}`)
      const fullSales = fullData?.sales || []
      const fullMedicines = fullData?.inventory || []
      const fullCustomers = fullData?.customers || []
      const fullPrescriptions = fullData?.prescriptions || []
      exportedBy = fullData?.exportedBy || exportedBy
      
      // Export only the selected tab's data using full datasets
      let exportData: Record<string, unknown> = {}
      let moduleName = ""
      
      switch (activeTab) {
        case "sales":
          exportData = { sales: fullSales }
          moduleName = "Sales"
          break
        case "inventory":
          exportData = { medicines: fullMedicines }
          moduleName = "Inventory"
          break
        case "products":
          exportData = { medicines: fullMedicines, topProducts: topProductsData }
          moduleName = "Products"
          break
        case "customers":
          exportData = { customers: fullCustomers }
          moduleName = "Customers"
          break
        default:
          exportData = {
            medicines: fullMedicines,
            sales: fullSales,
            customers: fullCustomers,
            prescriptions: fullPrescriptions
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
                  <TopProducts data={topProductsData as any} />
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
                  <CustomerGrowthChart customers={customersData as any} dateRange={dateRange} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Customer Insights</CardTitle>
                  <CardDescription>Key customer metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <CustomerInsights customers={customersData as any} revenueData={revenueData as any} dateRange={dateRange} />
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
  const [reportType, setReportType] = useState<string>("inventory")
  const [reportData, setReportData] = useState<ComplianceReportPayload | null>(null)
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
      const data = await getComplianceReport(
        reportType,
        dateRange.from.toISOString().split("T")[0],
        dateRange.to.toISOString().split("T")[0],
      )
      setReportData(data as unknown as ComplianceReportPayload)
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to load compliance report"),
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
              <CardDescription>
                Inventory and audit-trail compliance checks. For Nepal-specific narcotic register and tax
                reporting, see the DDA Narcotic Register and IRD Reports pages.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
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
