"use client"

import Link from "next/link"
import { useState, useEffect, type ComponentProps, type ReactNode } from "react"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Boxes,
  Calendar,
  ClipboardList,
  Download,
  FileSearch,
  Package,
  Percent,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { PageHeader } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Pagination } from "@/components/ui/pagination"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { useToast } from "@/hooks/use-toast"
import { useSystemSettingsMap } from "@/features/settings/hooks/use-system-settings"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import {
  getCategoryPerformance,
  getComplianceReport,
  getCustomerGrowth,
  getReportsOverviewKpis,
  getTopCustomers,
  getTopSellingMedicines,
} from "@/lib/api/reports-api"
import type { DotnetReportsOverviewDto } from "@/lib/api/accounting-reports-api"
import { salesApi } from "@/features/sales/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { customersApi } from "@/features/customers/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import type { CustomerGrowthPoint } from "@/features/customers/components/customer-growth-chart"
import type { TopCustomerInsight } from "@/features/customers/components/customer-insights"
import type { CategoryChartRow } from "@/features/medicines/components/category-chart"
import {
  mapCategoryPerformanceToRows,
  mapCustomerGrowthPointsToChartRows,
  mapMedicinesToInventoryRows,
  mapSalesToRevenueRows,
  mapSalesToSalesRows,
  mapTopSellingMedicinesToSaleItems,
} from "@/lib/reports/overview-mappers"

interface DateRange {
  from: Date
  to: Date
}

type GenericRow = Record<string, unknown>
type TopProductRow = ComponentProps<typeof TopProducts>["data"][number]
type CustomerRow = ComponentProps<typeof CustomerInsights>["customers"][number]

interface ComplianceReportPayload {
  reportType?: string
  summary?: Record<string, unknown>
  [key: string]: unknown
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

// Each row table below is paginated independently against the .NET API (real server-side paging,
// not a single large/unbounded fetch): its own page state, re-fetched per page change. The KPI cards
// come from a separate aggregate endpoint and are unaffected by these page sizes.
const ROW_PAGE_SIZE = 20

export default function ReportsPage() {
  const [hasSession, setHasSession] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  // Row data feeds charts and exports; each table is now fetched page-by-page from the server, so
  // only load failures (not sampling caps) need tracking here.
  const [rowErrors, setRowErrors] = useState<string[]>([])
  // Initialize from ?tab= so sidebar sub-links (e.g. Reports > Compliance) land
  // directly on the right tab.
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "sales"
    const tab = new URLSearchParams(window.location.search).get("tab")
    const validTabs = ["sales", "inventory", "products", "customers", "compliance"]
    return tab && validTabs.includes(tab) ? tab : "sales"
  })
  const { data: settings } = useSystemSettingsMap()
  // One branch scope for every KPI, chart and table on the page (ViewAll users pick; others are pinned).
  const branchFilter = useBranchFilter()
  const reportBranchId = branchFilter.branchId
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
  const [customersData, setCustomersData] = useState<CustomerRow[]>([])
  const [prescriptionsData, setPrescriptionsData] = useState<GenericRow[]>([])
  const [overviewKpis, setOverviewKpis] = useState<DotnetReportsOverviewDto | null>(null)

  // Whole-period chart aggregates — computed server-side over the full date range/branch scope by a
  // dedicated endpoint each, independent of any row table's page size (see lib/api/reports-api.ts).
  const [topProductsData, setTopProductsData] = useState<TopProductRow[]>([])
  const [categoryPerformanceData, setCategoryPerformanceData] = useState<CategoryChartRow[]>([])
  const [customerGrowthPoints, setCustomerGrowthPoints] = useState<CustomerGrowthPoint[]>([])
  const [topCustomer, setTopCustomer] = useState<TopCustomerInsight | null>(null)
  // Full low-stock list (not paginated) — reuses the existing medicines search with its "low" stock
  // filter, walking every page, so it reflects the whole catalogue rather than one page of it.
  const [lowStockData, setLowStockData] = useState<
    { name: string; stock_quantity: number; minimum_stock: number; unit_price: string; categories: { name: string } | null }[]
  >([])
  const [chartsLoading, setChartsLoading] = useState(true)

  // Independent page state + totals per row table (sales, inventory, customers) — detail tables only;
  // the chart aggregates above are unaffected by these page sizes.
  const [salesPage, setSalesPage] = useState(1)
  const [salesTotal, setSalesTotal] = useState(0)
  const [medicinesPage, setMedicinesPage] = useState(1)
  const [medicinesTotal, setMedicinesTotal] = useState(0)
  const [customersPage, setCustomersPage] = useState(1)
  const [customersTotal, setCustomersTotal] = useState(0)

  const [salesRowLoading, setSalesRowLoading] = useState(true)
  const [medicinesRowLoading, setMedicinesRowLoading] = useState(true)
  const [customersRowLoading, setCustomersRowLoading] = useState(true)

  const { toast } = useToast()
  const { formatCurrency } = useCurrency()

  const setRowError = (label: string, hasError: boolean) => {
    setRowErrors((prev) => {
      const withoutLabel = prev.filter((l) => l !== label)
      return hasError ? [...withoutLabel, label] : withoutLabel
    })
  }

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setHasSession(true)
      setIsLoading(false)
    }
    checkUser()
  }, [])

  // KPIs + prescriptions (not independently paginated — prescriptions only feed the "All" export)
  // load once per date range change, and reset every row table back to page 1.
  useEffect(() => {
    if (!hasSession) return
    fetchOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, dateRange, reportBranchId])

  const fetchOverview = async () => {
    if (!dateRange) return

    setIsLoading(true)

    try {
      const fromDate = formatLocalDateYmd(dateRange.from)
      const toDate = formatLocalDateYmd(dateRange.to)
      const [kpis, prescriptionsRes] = await Promise.all([
        getReportsOverviewKpis(fromDate, toDate, reportBranchId),
        prescriptionsApi.getPrescriptions({ dateFrom: fromDate, dateTo: toDate, limit: 200 }),
      ])
      setOverviewKpis(kpis)
      setRowError("prescriptions", Boolean(prescriptionsRes.error))
      setPrescriptionsData((prescriptionsRes.data || []) as unknown as GenericRow[])

      // Each row table re-fetches its own page 1 for the new date range (see the per-table
      // effects below, keyed on their own page state).
      setSalesPage(1)
      setMedicinesPage(1)
      setCustomersPage(1)
    } catch (error) {
      console.error("Error fetching report overview:", error)
      toast({
        title: "Error",
        description: "Failed to load report data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Whole-period chart aggregates: top products, category performance, customer growth and top
  // customers each come from their own server-side aggregate endpoint, computed over the full date
  // range/branch scope — independent of every row table's page size above. Low stock also reads the
  // full catalogue (via the existing medicines search's "low" filter, walking every page) rather than
  // one page of the Inventory tab's table.
  useEffect(() => {
    if (!hasSession || !dateRange) return
    const fromDate = formatLocalDateYmd(dateRange.from)
    const toDate = formatLocalDateYmd(dateRange.to)
    let cancelled = false
    setChartsLoading(true)

    Promise.all([
      getTopSellingMedicines(fromDate, toDate, 10, reportBranchId),
      getCategoryPerformance(fromDate, toDate, reportBranchId),
      getCustomerGrowth(fromDate, toDate),
      getTopCustomers(fromDate, toDate, 1),
      categoriesApi.getCategories(),
      // "low" excludes zero stock; the low-stock table lists everything at or below the reorder level.
      medicinesApi.getMedicines({ stockStatuses: ["low", "out"], limit: 1000, branchId: reportBranchId }),
    ])
      .then(([topSelling, categoryPerformance, growth, topCustomers, categoriesRes, lowStockRes]) => {
        if (cancelled) return
        setRowError("charts", Boolean(categoriesRes.error) || Boolean(lowStockRes.error))

        setTopProductsData(mapTopSellingMedicinesToSaleItems(topSelling))

        const categoryNameById = new Map(categoriesRes.data.map((c) => [c.id, c.name]))
        setCategoryPerformanceData(mapCategoryPerformanceToRows(categoryPerformance, categoryNameById))

        setCustomerGrowthPoints(mapCustomerGrowthPointsToChartRows(growth))

        const top = topCustomers[0]
        setTopCustomer(top ? { name: top.name, totalSpend: top.totalSpend } : null)

        setLowStockData(mapMedicinesToInventoryRows(lowStockRes.data || []))
      })
      .catch((error) => {
        if (cancelled) return
        console.error("Error fetching report chart aggregates:", error)
        setRowError("charts", true)
      })
      .finally(() => {
        if (!cancelled) setChartsLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, dateRange, reportBranchId])

  // Sales row table — true server-side pagination (page state re-fetches from the .NET API).
  useEffect(() => {
    if (!hasSession || !dateRange) return
    const fromDate = formatLocalDateYmd(dateRange.from)
    const toDate = formatLocalDateYmd(dateRange.to)
    let cancelled = false
    setSalesRowLoading(true)
    salesApi
      .getSales({ dateFrom: fromDate, dateTo: toDate, page: salesPage, limit: ROW_PAGE_SIZE, branchId: reportBranchId })
      .then((res) => {
        if (cancelled) return
        setRowError("sales", Boolean(res.error))
        const sales = res.data || []
        setSalesData(mapSalesToSalesRows(sales))
        setRevenueData(mapSalesToRevenueRows(sales))
        setSalesTotal(typeof res.total === "number" ? res.total : sales.length)
      })
      .finally(() => {
        if (!cancelled) setSalesRowLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, dateRange, salesPage, reportBranchId])

  // Inventory (medicines) row table — true server-side pagination.
  useEffect(() => {
    if (!hasSession) return
    let cancelled = false
    setMedicinesRowLoading(true)
    medicinesApi
      .getMedicines({ page: medicinesPage, limit: ROW_PAGE_SIZE, sortBy: "name", sortOrder: "asc", branchId: reportBranchId })
      .then((res) => {
        if (cancelled) return
        setRowError("medicines", Boolean(res.error))
        setInventoryData(mapMedicinesToInventoryRows(res.data || []))
        setMedicinesTotal(typeof res.total === "number" ? res.total : (res.data || []).length)
      })
      .finally(() => {
        if (!cancelled) setMedicinesRowLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, medicinesPage, reportBranchId])

  // Customers row table — true server-side pagination.
  useEffect(() => {
    if (!hasSession) return
    let cancelled = false
    setCustomersRowLoading(true)
    customersApi
      .getCustomers({ page: customersPage, limit: ROW_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        setRowError("customers", Boolean(res.error))
        setCustomersData(res.data || [])
        setCustomersTotal(typeof res.total === "number" ? res.total : (res.data || []).length)
      })
      .finally(() => {
        if (!cancelled) setCustomersRowLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, customersPage])

  const handleExportReports = async () => {
    try {
      let exportedBy = "Current User"

      const dateRangeStr = dateRange 
        ? `${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}`
        : 'All Time'

      // Reuse the row data already loaded for the on-screen tables (same wired endpoints, same period).
      const fullSales = salesData
      const fullMedicines = inventoryData
      const fullCustomers = customersData
      const fullPrescriptions = prescriptionsData

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
      const filename = `${moduleName.toLowerCase()}_report_${dateRange ? `${formatLocalDateYmd(dateRange.from)}_to_${formatLocalDateYmd(dateRange.to)}` : 'all_time'}`
      
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

  const periodLabel = dateRange
    ? `${dateRange.from.toLocaleDateString()} – ${dateRange.to.toLocaleDateString()}`
    : "All time"

  const kpis = overviewKpis
    ? [
        { label: "Sales", value: overviewKpis.saleCount.toLocaleString(), icon: Receipt, tone: "primary" as const, hint: "Invoices in period" },
        { label: "Total revenue", value: formatCurrency(overviewKpis.totalRevenue), icon: Wallet, tone: "success" as const, hint: "Gross sales in period" },
        { label: "Average sale", value: formatCurrency(overviewKpis.averageSaleAmount), icon: Banknote, tone: "default" as const, hint: "Per invoice" },
        { label: "Total discount", value: formatCurrency(overviewKpis.totalDiscount), icon: Percent, tone: "info" as const, hint: "Given in period" },
        { label: "Inventory valuation", value: formatCurrency(overviewKpis.inventoryValuation), icon: Boxes, tone: "default" as const, hint: "Current stock value" },
        { label: "Medicines", value: overviewKpis.totalMedicines.toLocaleString(), icon: Package, tone: "default" as const, hint: "Items in catalogue" },
        {
          label: "Low stock",
          value: overviewKpis.lowStockCount.toLocaleString(),
          icon: AlertTriangle,
          tone: overviewKpis.lowStockCount > 0 ? ("warning" as const) : ("success" as const),
          hint: overviewKpis.lowStockCount > 0 ? "Items below minimum stock" : "All items above minimum",
        },
        {
          label: "Prescriptions pending",
          value: overviewKpis.prescriptionsPending.toLocaleString(),
          icon: ClipboardList,
          tone: overviewKpis.prescriptionsPending > 0 ? ("info" as const) : ("default" as const),
          hint: "Awaiting dispensing",
        },
      ]
    : []

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Sales, stock and customer performance for the selected period."
          icon={BarChart3}
          actions={
            <Button variant="outline" onClick={handleExportReports} disabled={isLoading}>
              <Download aria-hidden />
              Export to Excel
            </Button>
          }
        />

        {/* Period selector — drives every KPI, chart and compliance report below */}
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
              aria-hidden
            >
              <Calendar className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Reporting period</p>
              <p className="num text-xs text-muted-foreground">
                {periodLabel}
                {branchFilter.access.branches.length > 1 && <> · {branchFilter.scopeLabel}</>}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <BranchFilterSelect filter={branchFilter} id="reports-branch" hideLabel />
            <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          </div>
        </div>

        {!isLoading && rowErrors.length > 0 && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Some report data didn&apos;t load</AlertTitle>
            <AlertDescription>
              <p>
                Charts and exports for {rowErrors.join(", ")} may be empty for this period. The summary cards are
                unaffected.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchOverview()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Row-level revenue metrics render once sales for the period have loaded */}
        {revenueData.length > 0 && <RevenueMetrics salesData={revenueData} />}

        {isLoading ? (
          <StatGrid cols={4}>
            {Array.from({ length: 8 }).map((_, i) => (
              <StatCard key={i} label="Loading metric" value="" loading />
            ))}
          </StatGrid>
        ) : kpis.length > 0 ? (
          <StatGrid cols={4}>
            {kpis.map((kpi) => (
              <StatCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                icon={kpi.icon}
                tone={kpi.tone}
                hint={kpi.hint}
              />
            ))}
          </StatGrid>
        ) : (
          <Card>
            <ErrorState
              size="compact"
              title="Couldn't load report metrics"
              message="The summary for this period didn't load. Check your connection and try again."
              onRetry={fetchOverview}
            />
          </Card>
        )}

        {/* Analytics tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="inline-flex w-full min-w-max sm:grid sm:min-w-0 sm:grid-cols-5">
              <TabsTrigger value="sales" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" aria-hidden />
                Sales
              </TabsTrigger>
              <TabsTrigger value="inventory" className="flex items-center gap-2">
                <Package className="h-4 w-4" aria-hidden />
                Inventory
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" aria-hidden />
                Products
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden />
                Customers
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Compliance
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sales" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title="Sales trend"
                description={`Page ${salesPage} of sales, ${periodLabel}`}
                loading={salesRowLoading}
                empty={salesData.length === 0}
                emptyIcon={TrendingUp}
                emptyTitle="No sales in this period"
                emptyDescription="Completed sales will be charted here. Try a wider period or record a sale."
                emptyAction={{ label: "New sale", href: "/dashboard/sales/new" }}
              >
                <SalesChart data={salesData} />
              </ChartCard>
              <ChartCard
                title="Payment methods"
                description="Revenue split by payment method"
                loading={salesRowLoading}
                empty={revenueData.length === 0}
                emptyIcon={Wallet}
                emptyTitle="No payments in this period"
                emptyDescription="Once sales are recorded, the revenue split by payment method appears here."
              >
                <PaymentMethodChart data={revenueData} />
              </ChartCard>
            </div>
            <Pagination
              currentPage={salesPage}
              totalPages={Math.max(1, Math.ceil(salesTotal / ROW_PAGE_SIZE))}
              totalItems={salesTotal}
              itemsPerPage={ROW_PAGE_SIZE}
              startIndex={(salesPage - 1) * ROW_PAGE_SIZE}
              onPageChange={setSalesPage}
            />
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title="Stock levels"
                description="Quantity on hand against minimum stock"
                loading={medicinesRowLoading}
                empty={inventoryData.length === 0}
                emptyIcon={Package}
                emptyTitle="No stock data to chart"
                emptyDescription="Stock levels appear here once medicines are added to inventory."
                emptyAction={{ label: "Go to inventory", href: "/dashboard/inventory" }}
              >
                <InventoryChart data={inventoryData} />
              </ChartCard>
              <ChartCard
                title="Low stock"
                description="Every item at or below its minimum stock level, across the whole catalogue"
                loading={chartsLoading}
                empty={lowStockData.length === 0}
                emptyIcon={AlertTriangle}
                emptyTitle="No low-stock items to show"
                emptyDescription="Items that fall below their minimum stock will be listed here for reordering."
              >
                <LowStockTable data={lowStockData} />
              </ChartCard>
            </div>
            <Pagination
              currentPage={medicinesPage}
              totalPages={Math.max(1, Math.ceil(medicinesTotal / ROW_PAGE_SIZE))}
              totalItems={medicinesTotal}
              itemsPerPage={ROW_PAGE_SIZE}
              startIndex={(medicinesPage - 1) * ROW_PAGE_SIZE}
              onPageChange={setMedicinesPage}
            />
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title="Top selling products"
                description={`Best sellers by quantity and revenue, whole period — ${periodLabel}`}
                loading={chartsLoading}
                empty={topProductsData.length === 0}
                emptyIcon={BarChart3}
                emptyTitle="No product sales in this period"
                emptyDescription="Your best sellers by quantity and revenue will be ranked here."
              >
                <TopProducts data={topProductsData} />
              </ChartCard>
              <ChartCard
                title="Category performance"
                description="Revenue by medicine category, whole period"
                loading={chartsLoading}
                empty={categoryPerformanceData.length === 0}
                emptyIcon={Boxes}
                emptyTitle="No category data yet"
                emptyDescription="Assign categories to medicines to compare performance across them."
              >
                <CategoryChart data={categoryPerformanceData} />
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title="Customer growth"
                description={`New customer registrations per month, whole period — ${periodLabel}`}
                loading={chartsLoading}
                empty={customerGrowthPoints.length === 0}
                emptyIcon={Users}
                emptyTitle="No new customers in this period"
                emptyDescription="Customers you register will be counted here month by month."
                emptyAction={{ label: "Go to customers", href: "/dashboard/customers" }}
              >
                <CustomerGrowthChart points={customerGrowthPoints} />
              </ChartCard>
              <ChartCard
                title="Customer insights"
                description="Key customer metrics for the period, including the whole-period top spender"
                loading={customersRowLoading || chartsLoading}
                empty={customersData.length === 0}
                emptyIcon={Users}
                emptyTitle="No customer activity yet"
                emptyDescription="New and repeat customer metrics appear once customers make purchases."
              >
                <CustomerInsights
                  customers={customersData}
                  revenueData={revenueData}
                  dateRange={dateRange}
                  topCustomer={topCustomer}
                />
              </ChartCard>
            </div>
            <Pagination
              currentPage={customersPage}
              totalPages={Math.max(1, Math.ceil(customersTotal / ROW_PAGE_SIZE))}
              totalItems={customersTotal}
              itemsPerPage={ROW_PAGE_SIZE}
              startIndex={(customersPage - 1) * ROW_PAGE_SIZE}
              onPageChange={setCustomersPage}
            />
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            <ComplianceReportsTab dateRange={dateRange} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

interface ChartCardProps {
  title: string
  description: string
  loading: boolean
  empty: boolean
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription: string
  emptyAction?: { label: string; href: string }
  children: ReactNode
}

/** Chart wrapper: title + description, a layout-matched skeleton while loading, and an empty state instead of a blank axis. */
function ChartCard({
  title,
  description,
  loading,
  empty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">Loading {title}</span>
            <Skeleton className="h-64 w-full" />
            <div className="flex justify-center gap-4">
              <Skeleton variant="text" className="w-16" />
              <Skeleton variant="text" className="w-16" />
              <Skeleton variant="text" className="w-16" />
            </div>
          </div>
        ) : empty ? (
          <EmptyState
            size="compact"
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

// Compliance Reports Component
function ComplianceReportsTab({ dateRange }: { dateRange: DateRange | undefined }) {
  const [reportType, setReportType] = useState<string>("inventory")
  const [reportData, setReportData] = useState<ComplianceReportPayload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  // Report type and period both re-fetch; a response for a superseded selection (e.g. the slower
  // report after a quick type switch) is dropped so it can't replace the current one.
  useEffect(() => {
    if (!dateRange) return
    let cancelled = false
    setIsLoading(true)
    getComplianceReport(reportType, formatLocalDateYmd(dateRange.from), formatLocalDateYmd(dateRange.to))
      .then((data) => {
        if (!cancelled) setReportData(data as unknown as ComplianceReportPayload)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setReportData(null)
        toast({
          title: "Error",
          description: getErrorMessage(error, "Failed to load compliance report"),
          variant: "destructive",
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, dateRange])

  const handleExportComplianceReport = async () => {
    if (!reportData) return

    try {
      const exportData = {
        [reportType]: reportData,
      }
      const filename = `${reportType}_compliance_report_${dateRange ? `${formatLocalDateYmd(dateRange.from)}_to_${formatLocalDateYmd(dateRange.to)}` : 'all_time'}`

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-display text-base">Compliance checks</CardTitle>
              <CardDescription>
                Inventory discrepancy and audit-trail checks for the selected period. For statutory filings use the{" "}
                <Link href="/dashboard/reports/dda-narcotic" className="font-medium text-primary underline-offset-4 hover:underline">
                  DDA narcotic register
                </Link>{" "}
                and{" "}
                <Link href="/dashboard/reports/ird" className="font-medium text-primary underline-offset-4 hover:underline">
                  IRD reports
                </Link>
                .
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="compliance-report-type" className="text-xs text-muted-foreground">
                  Report type
                </Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger id="compliance-report-type" className="w-[200px]">
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">Inventory discrepancy</SelectItem>
                    <SelectItem value="audit">Audit trail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleExportComplianceReport} disabled={!reportData || isLoading}>
                <Download aria-hidden />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4" aria-busy="true">
              <span className="sr-only">Loading compliance report</span>
              <StatGrid cols={4}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <StatCard key={i} label="Loading" value="" loading />
                ))}
              </StatGrid>
              <Skeleton className="h-48 w-full" />
            </div>
          ) : reportData ? (
            <div className="space-y-6">
              {Object.keys(reportData.summary || {}).length > 0 && (
                <StatGrid cols={4}>
                  {Object.entries(reportData.summary || {}).map(([key, value]) => {
                    const displayValue = typeof value === 'object' && value !== null
                      ? JSON.stringify(value)
                      : value != null
                      ? String(value)
                      : 'N/A'
                    const label = key.replace(/([A-Z])/g, ' $1').trim()
                    return (
                      <StatCard
                        key={key}
                        label={label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}
                        value={displayValue}
                      />
                    )
                  })}
                </StatGrid>
              )}
              <section aria-labelledby="compliance-details-heading">
                <h3 id="compliance-details-heading" className="mb-3 font-display text-base font-semibold text-foreground">
                  Report details
                </h3>
                <div className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-4">
                  <pre className="num text-xs leading-relaxed text-foreground sm:text-sm">{JSON.stringify(reportData, null, 2)}</pre>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState
              size="compact"
              icon={FileSearch}
              title="No compliance report yet"
              description="Choose a report type and reporting period above to generate a compliance check."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
