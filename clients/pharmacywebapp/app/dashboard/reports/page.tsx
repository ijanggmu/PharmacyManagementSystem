"use client"

import Link from "next/link"
import { useState, useEffect, type ComponentProps, type ReactNode } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import SalesChart from "@/features/sales/components/sales-chart"
import InventoryChart from "@/features/medicines/components/inventory-chart"
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
  BookMarked,
  Boxes,
  Calendar,
  ChevronRight,
  ClipboardList,
  Download,
  FileSearch,
  FileText,
  Landmark,
  Package,
  PackageX,
  Percent,
  Receipt,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { PageHeader } from "@/components/layouts"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { StatCard, StatGrid, type StatCardProps } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Pagination } from "@/components/ui/pagination"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  type AuditTrailComplianceReport,
  type ComplianceReport,
  type InventoryDiscrepancyReport,
} from "@/lib/api/reports-api"
import type { DotnetReportsOverviewDto } from "@/lib/api/accounting-reports-api"
import { salesApi } from "@/features/sales/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { customersApi } from "@/features/customers/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { useHasPermission } from "@/lib/hooks/use-has-permission"
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

const REPORT_TABS = ["sales", "inventory", "products", "customers", "compliance"] as const
type ReportTab = (typeof REPORT_TABS)[number]

function isReportTab(value: string | null): value is ReportTab {
  return value !== null && (REPORT_TABS as readonly string[]).includes(value)
}

// What the header export button writes for each tab (compliance has its own export, so the header
// button exports every module's rows there).
const EXPORT_LABELS: Record<ReportTab, string> = {
  sales: "Sales",
  inventory: "Inventory",
  products: "Products",
  customers: "Customers",
  compliance: "All",
}

// Human names for the row-load failure banner.
const ROW_ERROR_LABELS: Record<string, string> = {
  sales: "sales",
  medicines: "inventory",
  customers: "customers",
  prescriptions: "prescriptions",
  charts: "product, category and low-stock charts",
}

interface ReportLink {
  title: string
  description: string
  href: string
  icon: LucideIcon
}

const SPECIALIZED_REPORTS: ReportLink[] = [
  {
    title: "Accounting",
    description: "Ledger, cash & bank, statements and trial balance",
    href: "/dashboard/reports/accounting",
    icon: Landmark,
  },
  {
    title: "Dead stock",
    description: "Items that haven't sold — free up shelf space and cash",
    href: "/dashboard/reports/dead-stock",
    icon: PackageX,
  },
  {
    title: "Narcotic register",
    description: "DDA controlled-drug dispensing register",
    href: "/dashboard/reports/dda-narcotic",
    icon: ShieldCheck,
  },
  {
    title: "IRD reports",
    description: "Sales and purchase books for tax filing",
    href: "/dashboard/reports/ird",
    icon: FileText,
  },
  {
    title: "Audit log",
    description: "Who changed what, and when",
    href: "/dashboard/reports/audit-logs",
    icon: BookMarked,
  },
  {
    title: "Approvals log",
    description: "Manager approvals: discounts, voids, refunds, credit and price overrides",
    href: "/dashboard/reports/approvals",
    icon: ShieldCheck,
  },
]

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
  const [activeTab, setActiveTabState] = useState<ReportTab>(() => {
    if (typeof window === "undefined") return "sales"
    const tab = new URLSearchParams(window.location.search).get("tab")
    return isReportTab(tab) ? tab : "sales"
  })
  // Mirror the tab into ?tab= so a reload, back-navigation or shared link lands on the same view.
  const setActiveTab = (value: string) => {
    if (!isReportTab(value)) return
    setActiveTabState(value)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", value)
    window.history.replaceState(window.history.state, "", url)
  }
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
  const t = useTranslations("reports")
  const { formatNumber } = useI18n()

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

  const { allowed: canReadPrescriptions } = useHasPermission("Permissions.Prescriptions.Prescriptions.View")
  // The KPI aggregate is an accounting report; a pharmacist opens this page for the sales/stock tables without it.
  const { allowed: canViewKpis, isLoading: kpiPermissionLoading } = useHasPermission("Permissions.Accounting.Reports.View")

  // KPIs + prescriptions (not independently paginated — prescriptions only feed the "All" export)
  // load once per date range change, and reset every row table back to page 1.
  useEffect(() => {
    if (!hasSession) return
    fetchOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, dateRange, reportBranchId, canReadPrescriptions, canViewKpis, kpiPermissionLoading])

  const fetchOverview = async () => {
    if (!dateRange || kpiPermissionLoading) return

    setIsLoading(true)

    try {
      const fromDate = formatLocalDateYmd(dateRange.from)
      const toDate = formatLocalDateYmd(dateRange.to)
      const [kpis, prescriptionsRes] = await Promise.all([
        canViewKpis ? getReportsOverviewKpis(fromDate, toDate, reportBranchId) : Promise.resolve(null),
        // Prescriptions feed only the "All" export; a role that can't read them (an accountant) exports without.
        canReadPrescriptions
          ? prescriptionsApi.getPrescriptions({ dateFrom: fromDate, dateTo: toDate, limit: 200 })
          : Promise.resolve({ data: [], error: null }),
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

  const pageRangeLabel = (page: number, total: number, noun: string) => {
    if (total === 0) return `No ${noun}`
    const start = (page - 1) * ROW_PAGE_SIZE + 1
    const end = Math.min(page * ROW_PAGE_SIZE, total)
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`
  }

  const salesKpis: StatCardProps[] = overviewKpis
    ? [
        { label: t("kpi.totalRevenue"), value: formatCurrency(overviewKpis.totalRevenue), icon: Wallet, tone: "success", hint: t("kpi.totalRevenueHint") },
        { label: t("kpi.sales"), value: formatNumber(overviewKpis.saleCount), icon: Receipt, tone: "primary", hint: t("kpi.salesHint") },
        { label: t("kpi.averageSale"), value: formatCurrency(overviewKpis.averageSaleAmount), icon: Banknote, tone: "default", hint: t("kpi.averageSaleHint") },
        { label: t("kpi.totalDiscount"), value: formatCurrency(overviewKpis.totalDiscount), icon: Percent, tone: "info", hint: t("kpi.totalDiscountHint") },
      ]
    : []

  const stockKpis: StatCardProps[] = overviewKpis
    ? [
        { label: t("kpi.inventoryValuation"), value: formatCurrency(overviewKpis.inventoryValuation), icon: Boxes, tone: "default", hint: t("kpi.inventoryValuationHint") },
        { label: t("kpi.medicines"), value: formatNumber(overviewKpis.totalMedicines), icon: Package, tone: "default", hint: t("kpi.medicinesHint") },
        {
          label: t("kpi.lowStock"),
          value: formatNumber(overviewKpis.lowStockCount),
          icon: AlertTriangle,
          tone: overviewKpis.lowStockCount > 0 ? "warning" : "success",
          hint: overviewKpis.lowStockCount > 0 ? t("kpi.lowStockHintSome") : t("kpi.lowStockHintNone"),
          onClick: overviewKpis.lowStockCount > 0 ? () => setActiveTab("inventory") : undefined,
        },
        {
          label: t("kpi.prescriptionsPending"),
          value: formatNumber(overviewKpis.prescriptionsPending),
          icon: ClipboardList,
          tone: overviewKpis.prescriptionsPending > 0 ? "info" : "default",
          hint: t("kpi.prescriptionsPendingHint"),
          href: overviewKpis.prescriptionsPending > 0 ? "/dashboard/prescriptions" : undefined,
        },
      ]
    : []

  const failedRowLabels = rowErrors.map((key) => ROW_ERROR_LABELS[key] ?? key)
  const exportLabel = EXPORT_LABELS[activeTab]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={t("page.title")}
          description={t("page.description")}
          icon={BarChart3}
          actions={
            <Button variant="outline" onClick={handleExportReports} disabled={isLoading}>
              <Download aria-hidden />
              {exportLabel === "All" ? t("page.exportAll") : t("page.exportTab", { tab: t(`tabs.${activeTab}` as const).toLowerCase() })}
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
              <p className="num text-xs text-muted-foreground" aria-live="polite">
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

        {!isLoading && failedRowLabels.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Some report data didn&apos;t load</AlertTitle>
            <AlertDescription>
              <p>
                Charts and exports for {failedRowLabels.join(", ")} may be empty for this period. The summary cards are
                unaffected.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchOverview()}>
                <RotateCcw aria-hidden />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading || hasAnyKpis(salesKpis, stockKpis) ? (
          <div className="grid gap-6">
            <KpiGroup title={t("page.salesPerformance")} id="kpi-sales" items={salesKpis} loading={isLoading} />
            <KpiGroup title={t("page.stockDispensing")} id="kpi-stock" items={stockKpis} loading={isLoading} />
          </div>
        ) : (
          <Card>
            <ErrorState
              size="compact"
              title={t("page.loadErrorTitle")}
              message={t("page.loadErrorMessage")}
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
                {t("tabs.sales")}
              </TabsTrigger>
              <TabsTrigger value="inventory" className="flex items-center gap-2">
                <Package className="h-4 w-4" aria-hidden />
                {t("tabs.inventory")}
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" aria-hidden />
                {t("tabs.products")}
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden />
                {t("tabs.customers")}
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {t("tabs.compliance")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sales" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title={t("charts.salesTrend")}
                description={`${pageRangeLabel(salesPage, salesTotal, "sales")} · ${periodLabel}`}
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
                title={t("charts.paymentMethods")}
                description={`Revenue split by payment method · ${pageRangeLabel(salesPage, salesTotal, "sales")}`}
                loading={salesRowLoading}
                empty={revenueData.length === 0}
                emptyIcon={Wallet}
                emptyTitle="No payments in this period"
                emptyDescription="Once sales are recorded, the revenue split by payment method appears here."
              >
                <PaymentMethodChart data={revenueData} />
              </ChartCard>
            </div>
            <ChartPager
              label="Browse sales"
              page={salesPage}
              total={salesTotal}
              onPageChange={setSalesPage}
            />
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title={t("charts.stockLevels")}
                description={`Quantity on hand against minimum stock · ${pageRangeLabel(medicinesPage, medicinesTotal, "medicines")}`}
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
                title={t("charts.lowStock")}
                description="Every item at or below its minimum stock level, across the whole catalogue"
                badge={
                  !chartsLoading && lowStockData.length > 0 ? (
                    <Badge variant="warning">{lowStockData.length.toLocaleString()} to reorder</Badge>
                  ) : undefined
                }
                loading={chartsLoading}
                empty={lowStockData.length === 0}
                emptyIcon={AlertTriangle}
                emptyTitle="Nothing to reorder"
                emptyDescription="Every item is above its minimum stock. Items that drop below it will be listed here."
              >
                <LowStockTable data={lowStockData} />
              </ChartCard>
            </div>
            <ChartPager
              label="Browse medicines"
              page={medicinesPage}
              total={medicinesTotal}
              onPageChange={setMedicinesPage}
            />
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard
                title={t("charts.topProducts")}
                description={`Best sellers by quantity and revenue, whole period · ${periodLabel}`}
                loading={chartsLoading}
                empty={topProductsData.length === 0}
                emptyIcon={BarChart3}
                emptyTitle="No product sales in this period"
                emptyDescription="Your best sellers by quantity and revenue will be ranked here."
              >
                <TopProducts data={topProductsData} />
              </ChartCard>
              <ChartCard
                title={t("charts.categoryPerformance")}
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
                title={t("charts.customerGrowth")}
                description={`New customer registrations per month, whole period · ${periodLabel}`}
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
                title={t("charts.customerInsights")}
                description={`Key customer metrics, including the whole-period top spender · ${pageRangeLabel(customersPage, customersTotal, "customers")}`}
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
            <ChartPager
              label="Browse customers"
              page={customersPage}
              total={customersTotal}
              onPageChange={setCustomersPage}
            />
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            <ComplianceReportsTab dateRange={dateRange} pharmacyName={settings?.pharmacy_name} />
          </TabsContent>
        </Tabs>

        <section aria-labelledby="specialized-reports-heading" className="space-y-3 pt-2">
          <div>
            <h2 id="specialized-reports-heading" className="font-display text-base font-semibold text-foreground">
              Specialized reports
            </h2>
            <p className="text-sm text-muted-foreground">Statutory, financial and housekeeping reports.</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {SPECIALIZED_REPORTS.map((report) => (
              <li key={report.href}>
                <ReportLinkCard report={report} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  )
}

function hasAnyKpis(...groups: StatCardProps[][]): boolean {
  return groups.some((g) => g.length > 0)
}

/** A titled row of KPI tiles; renders same-size skeletons while loading so the grid never jumps. */
function KpiGroup({ title, id, items, loading }: { title: string; id: string; items: StatCardProps[]; loading: boolean }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <StatGrid cols={4}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatCard key={i} label="Loading metric" value="" loading />)
          : items.map((kpi) => <StatCard key={kpi.label} {...kpi} />)}
      </StatGrid>
    </section>
  )
}

/** Pager for the row-backed charts above it — states which slice of the period is being charted. */
function ChartPager({
  label,
  page,
  total,
  onPageChange,
}: {
  label: string
  page: number
  total: number
  onPageChange: (page: number) => void
}) {
  if (total <= ROW_PAGE_SIZE) return null
  return (
    <nav aria-label={label} className="rounded-xl border bg-card px-4 py-2 shadow-xs">
      <Pagination
        currentPage={page}
        totalPages={Math.max(1, Math.ceil(total / ROW_PAGE_SIZE))}
        totalItems={total}
        itemsPerPage={ROW_PAGE_SIZE}
        startIndex={(page - 1) * ROW_PAGE_SIZE}
        onPageChange={onPageChange}
      />
    </nav>
  )
}

function ReportLinkCard({ report }: { report: ReportLink }) {
  const Icon = report.icon
  return (
    <Link
      href={report.href}
      className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] duration-200 ease-out hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium text-foreground">
          {report.title}
          <ChevronRight
            className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{report.description}</span>
      </span>
    </Link>
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
  /** Small status beside the title, e.g. a count badge. */
  badge?: ReactNode
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
  badge,
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-display text-base">{title}</CardTitle>
          {badge}
        </div>
        <CardDescription className="num">{description}</CardDescription>
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
type ComplianceType = "inventory" | "audit"

const COMPLIANCE_TYPES: Record<ComplianceType, { label: string; description: string }> = {
  inventory: {
    label: "Inventory discrepancy",
    description: "Medicines whose stock on hand is outside their configured limits.",
  },
  audit: {
    label: "Audit trail",
    description: "Every recorded change and sensitive-data access in the period.",
  },
}

// Large audit periods can return thousands of rows; the on-screen table shows the most recent ones
// and the Excel export carries the full set.
const COMPLIANCE_ROW_LIMIT = 100

function isInventoryReport(report: ComplianceReport): report is InventoryDiscrepancyReport {
  return "discrepancies" in report
}

function ComplianceReportsTab({
  dateRange,
  pharmacyName,
}: {
  dateRange: DateRange | undefined
  pharmacyName?: string
}) {
  const [reportType, setReportType] = useState<ComplianceType>("inventory")
  const [reportData, setReportData] = useState<ComplianceReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { toast } = useToast()
  const t = useTranslations("reports")

  // Report type and period both re-fetch; a response for a superseded selection (e.g. the slower
  // report after a quick type switch) is dropped so it can't replace the current one.
  useEffect(() => {
    if (!dateRange) return
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)
    getComplianceReport(reportType, formatLocalDateYmd(dateRange.from), formatLocalDateYmd(dateRange.to))
      .then((data) => {
        if (!cancelled) setReportData(data)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setReportData(null)
        setLoadError(getErrorMessage(error, "Failed to load compliance report"))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reportType, dateRange, reloadKey])

  const handleExportComplianceReport = async () => {
    if (!reportData) return

    try {
      const rangeLabel = dateRange
        ? `${dateRange.from.toLocaleDateString()} to ${dateRange.to.toLocaleDateString()}`
        : "All Time"
      const exportData = {
        [reportType]: isInventoryReport(reportData) ? reportData.discrepancies : reportData.logs,
      }
      const filename = `${reportType}_compliance_report_${dateRange ? `${formatLocalDateYmd(dateRange.from)}_to_${formatLocalDateYmd(dateRange.to)}` : 'all_time'}`

      exportToExcel(exportData, filename, {
        exportedBy: "System",
        exportedDate: new Date().toLocaleString(),
        documentName: `${reportData.reportType} - ${rangeLabel}`,
        dateRange: rangeLabel,
        pharmacyName: pharmacyName || "Pharmacy Management System",
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
              <CardTitle className="font-display text-base">{t("charts.complianceChecks")}</CardTitle>
              <CardDescription>
                {COMPLIANCE_TYPES[reportType].description} For statutory filings use the{" "}
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
                <Select value={reportType} onValueChange={(value) => setReportType(value as ComplianceType)}>
                  <SelectTrigger id="compliance-report-type" className="w-[200px]">
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COMPLIANCE_TYPES) as ComplianceType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {COMPLIANCE_TYPES[type].label}
                      </SelectItem>
                    ))}
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
              <StatGrid cols={reportType === "inventory" ? 4 : 3}>
                {Array.from({ length: reportType === "inventory" ? 4 : 3 }).map((_, i) => (
                  <StatCard key={i} label="Loading" value="" loading />
                ))}
              </StatGrid>
              <Skeleton className="h-48 w-full" />
            </div>
          ) : loadError ? (
            <ErrorState
              size="compact"
              title="Couldn't load this compliance report"
              message={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          ) : reportData ? (
            isInventoryReport(reportData) ? (
              <InventoryComplianceView report={reportData} />
            ) : (
              <AuditComplianceView report={reportData} />
            )
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

function InventoryComplianceView({ report }: { report: InventoryDiscrepancyReport }) {
  const { summary, discrepancies } = report
  const shown = discrepancies.slice(0, COMPLIANCE_ROW_LIMIT)
  return (
    <div className="space-y-6">
      <StatGrid cols={4}>
        <StatCard label="Medicines checked" value={summary.totalMedicines.toLocaleString()} icon={Package} />
        <StatCard
          label="Discrepancies"
          value={summary.discrepancies.toLocaleString()}
          icon={AlertTriangle}
          tone={summary.discrepancies > 0 ? "warning" : "success"}
          hint={summary.discrepancies > 0 ? "Need review" : "Everything within limits"}
        />
        <StatCard label="Low stock" value={summary.lowStock.toLocaleString()} tone={summary.lowStock > 0 ? "warning" : "default"} hint="Below minimum" />
        <StatCard label="Overstock" value={summary.overstock.toLocaleString()} hint="Above maximum" />
      </StatGrid>

      {discrepancies.length === 0 ? (
        <EmptyState
          size="compact"
          icon={ShieldCheck}
          title="No discrepancies found"
          description="Every medicine is within its stock limits."
        />
      ) : (
        <ComplianceTableSection
          title="Discrepancies"
          shown={shown.length}
          total={discrepancies.length}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Minimum</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row, i) => (
                <TableRow key={`${row.medicine ?? "unknown"}-${i}`}>
                  <TableCell className="font-medium">{row.medicine ?? "Unnamed medicine"}</TableCell>
                  <TableCell className="num text-right">{row.currentStock?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell className="num text-right">{row.minimumStock?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell>
                    {row.status === "low" ? (
                      <Badge variant="warning">
                        <AlertTriangle aria-hidden />
                        Low stock
                      </Badge>
                    ) : (
                      <Badge variant="info">Overstock</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ComplianceTableSection>
      )}
    </div>
  )
}

function AuditComplianceView({ report }: { report: AuditTrailComplianceReport }) {
  const { summary, logs } = report
  const actions = Object.entries(summary.byAction).sort(([, a], [, b]) => b - a)
  const shown = logs.slice(0, COMPLIANCE_ROW_LIMIT)
  return (
    <div className="space-y-6">
      <StatGrid cols={3}>
        <StatCard label="Audit entries" value={summary.totalLogs.toLocaleString()} icon={BookMarked} tone="primary" hint="In period" />
        <StatCard
          label="Sensitive-data access"
          value={summary.phiAccessCount.toLocaleString()}
          icon={ShieldCheck}
          tone={summary.phiAccessCount > 0 ? "info" : "default"}
          hint="Patient record reads"
        />
        <StatCard label="Action types" value={actions.length.toLocaleString()} icon={ClipboardList} hint="Distinct actions logged" />
      </StatGrid>

      {actions.length > 0 && (
        <section aria-labelledby="audit-by-action-heading" className="space-y-2">
          <h3 id="audit-by-action-heading" className="text-sm font-semibold text-foreground">
            Entries by action
          </h3>
          <ul className="flex flex-wrap gap-2">
            {actions.map(([action, count]) => (
              <li key={action}>
                <Badge variant="muted" className="gap-1.5 px-2.5 py-1 text-xs">
                  <span className="capitalize">{action.toLowerCase()}</span>
                  <span className="num font-semibold text-foreground">{count.toLocaleString()}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {logs.length === 0 ? (
        <EmptyState
          size="compact"
          icon={FileSearch}
          title="No audit entries in this period"
          description="Changes to records will be logged here. Try a wider period."
        />
      ) : (
        <ComplianceTableSection title="Recent entries" shown={shown.length} total={logs.length}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record type</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="num whitespace-nowrap text-muted-foreground">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {log.action?.toLowerCase() ?? "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.table_name ?? "—"}</TableCell>
                  <TableCell className="num max-w-[16rem] truncate text-muted-foreground" title={log.record_id ?? undefined}>
                    {log.record_id ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ComplianceTableSection>
      )}
    </div>
  )
}

function ComplianceTableSection({
  title,
  shown,
  total,
  children,
}: {
  title: string
  shown: number
  total: number
  children: ReactNode
}) {
  const headingId = `compliance-${title.toLowerCase().replace(/\s+/g, "-")}-heading`
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-display text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="num text-xs text-muted-foreground">
          {shown < total
            ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} — export for the full list`
            : `${total.toLocaleString()} ${total === 1 ? "row" : "rows"}`}
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border">{children}</div>
    </section>
  )
}
