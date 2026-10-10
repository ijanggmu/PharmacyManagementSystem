"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, FileSearch, FileText, Filter, Printer, Search } from "lucide-react"
import { PageHeader } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { getNarcoticRegisterPage, getAllNarcoticRegisterRows, type NarcoticRegisterFilters } from "@/lib/api/reports-api"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { Pagination } from "@/components/ui/pagination"
import { exportTableToCsv, type ExportColumn } from "@/lib/utils/table-export"
import { formatLocalDateYmd } from "@/lib/utils/date"

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

// The .NET narcotic-register endpoint (/api/v1/sales/reports/narcotic-register) now pages for real
// (`PagedResponse<NarcoticRegisterRowDto>`), so the table requests one page at a time. CSV export
// still needs every row for the period/filters, so it fetches all pages separately (see
// handleDownloadCsv) rather than reusing whatever page happens to be loaded in the table.
const PAGE_SIZE = 20

interface DateRange {
  from: Date
  to: Date
}

interface NarcoticRow {
  sale_date: string
  sale_number: string | null
  invoice_number: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  prescription_number: string | null
  doctor_name: string | null
  doctor_license: string | null
  medicine_name: string | null
  strength: string | null
  form: string | null
  quantity: number
  unit_price: number
  line_total: number
  branch_id: string | null
}

export default function DdaNarcoticRegisterPage() {
  const { toast } = useToast()
  // DDA registers are kept per premises: ViewAll users pick the branch (or all), others are pinned.
  const branchFilter = useBranchFilter()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })
  const [medicineName, setMedicineName] = useState("")
  const [doctorName, setDoctorName] = useState("")
  const [schedule, setSchedule] = useState("")
  const [rows, setRows] = useState<NarcoticRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [appliedFilters, setAppliedFilters] = useState<NarcoticRegisterFilters | null>(null)

  useEffect(() => {
    if (dateRange) {
      void fetchRows(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Filters currently typed in the form (local calendar days — toISOString would shift them in UTC+ zones). */
  const formFilters = (): NarcoticRegisterFilters | null =>
    dateRange
      ? {
          periodStart: formatLocalDateYmd(dateRange.from),
          periodEnd: formatLocalDateYmd(dateRange.to),
          medicineName: medicineName.trim(),
          doctorName: doctorName.trim(),
          schedule: schedule.trim(),
          branchId: branchFilter.branchId ?? null,
        }
      : null

  /** Applying the form loads page 1; paging re-uses the filters last applied, not unsaved edits. */
  const fetchRows = async (page: number, filters: NarcoticRegisterFilters | null = formFilters()) => {
    if (!filters) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const fetched = await getNarcoticRegisterPage(filters, page, PAGE_SIZE)
      setRows(fetched.rows)
      setTotalItems(fetched.totalCount)
      setTotalPages(Math.max(1, fetched.totalPages))
      setCurrentPage(fetched.pageNumber)
      setAppliedFilters(filters)
    } catch (error: unknown) {
      const message = errorMessage(error, "Could not load narcotic register data.")
      setLoadError(message)
      toast({
        title: "Failed to load register",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePageChange = (page: number) => {
    void fetchRows(page, appliedFilters ?? formFilters())
  }

  // No legacy route left to call for this — the .NET path has no CSV endpoint, only JSON rows
  // (same as the narcotic register's data fetch). Build the CSV client-side from whatever is
  // already loaded, instead of hitting a route that no longer exists.
  const NARCOTIC_CSV_COLUMNS: ExportColumn<NarcoticRow>[] = [
    { header: "Sale date", value: (r) => r.sale_date },
    { header: "Sale #", value: (r) => r.sale_number ?? "" },
    { header: "Invoice #", value: (r) => r.invoice_number ?? "" },
    { header: "Patient first name", value: (r) => r.first_name ?? "" },
    { header: "Patient last name", value: (r) => r.last_name ?? "" },
    { header: "Date of birth", value: (r) => r.date_of_birth ?? "" },
    { header: "Prescription #", value: (r) => r.prescription_number ?? "" },
    { header: "Doctor name", value: (r) => r.doctor_name ?? "" },
    { header: "Doctor license", value: (r) => r.doctor_license ?? "" },
    { header: "Medicine", value: (r) => r.medicine_name ?? "" },
    { header: "Strength", value: (r) => r.strength ?? "" },
    { header: "Form", value: (r) => r.form ?? "" },
    { header: "Quantity", value: (r) => r.quantity },
    { header: "Unit price", value: (r) => r.unit_price },
    { header: "Line total", value: (r) => r.line_total },
    { header: "Branch", value: (r) => branchFilter.branchName(r.branch_id) },
  ]

  // The table fetch only loads the current page — export needs every row for the period/filters,
  // so this walks every page (via getAllNarcoticRegisterRows) before building the CSV, rather than
  // exporting whatever page happens to be on screen.
  const handleDownloadCsv = async () => {
    if (!dateRange || !appliedFilters || totalItems === 0) {
      toast({
        title: "Nothing to export",
        description: "Load the register for a date range first.",
        variant: "destructive",
      })
      return
    }
    setIsDownloading(true)
    try {
      const allRows = await getAllNarcoticRegisterRows(appliedFilters)
      const filename = `dda-narcotic-${appliedFilters.periodStart}-to-${appliedFilters.periodEnd}`
      exportTableToCsv(allRows, NARCOTIC_CSV_COLUMNS, filename)
      toast({
        title: "Export started",
        description: "DDA narcotic register CSV has been generated.",
      })
    } catch (error: unknown) {
      toast({
        title: "Export failed",
        description: errorMessage(error, "Could not export DDA register."),
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * PAGE_SIZE
  const paginatedRows = rows

  const renderTable = () => {
    if (loadError) {
      return (
        <ErrorState
          size="compact"
          title="Couldn't load the narcotic register"
          message={`${loadError} Check your connection and try again.`}
          onRetry={() => void fetchRows(currentPage, appliedFilters ?? formFilters())}
        />
      )
    }

    if (!rows || rows.length === 0) {
      return (
        <EmptyState
          size="compact"
          icon={FileSearch}
          title="No controlled-substance sales"
          description="Nothing was dispensed for the selected period and filters. Widen the period or clear the filters."
        />
      )
    }

    return (
      <>
      <div className="max-h-[480px] overflow-auto rounded-lg border">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Date</th>
              {branchFilter.showBranchColumn && (
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Branch</th>
              )}
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Invoice / Sale #</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Patient</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">DOB</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Prescription #</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Doctor</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Reg. No.</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Medicine</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium">Form / Strength</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">Unit Price</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr key={idx} className="border-t transition-colors hover:bg-muted/40">
                <td className="num whitespace-nowrap px-3 py-1.5">
                  {row.sale_date ? new Date(row.sale_date).toLocaleDateString() : ""}
                </td>
                {branchFilter.showBranchColumn && (
                  <td className="whitespace-nowrap px-3 py-1.5">{branchFilter.branchName(row.branch_id)}</td>
                )}
                <td className="num whitespace-nowrap px-3 py-1.5">
                  {row.invoice_number || row.sale_number || ""}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">
                  {`${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()}
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5">
                  {row.date_of_birth ? new Date(row.date_of_birth).toLocaleDateString() : ""}
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5">{row.prescription_number || ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5">{row.doctor_name || ""}</td>
                <td className="num whitespace-nowrap px-3 py-1.5">{row.doctor_license || ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{row.medicine_name || ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {[row.form, row.strength].filter(Boolean).join(" / ")}
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-right">{row.quantity}</td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-right">
                  {row.unit_price != null ? row.unit_price.toFixed(2) : ""}
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-right font-medium">
                  {row.line_total != null ? row.line_total.toFixed(2) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={PAGE_SIZE}
        startIndex={startIndex}
        onPageChange={handlePageChange}
        className="mt-4"
      />
      </>
    )
  }

  // This page's dispensed quantity only — summing across the whole period/filters would mean
  // walking every page on every render, which the "units dispensed" badge doesn't need.
  const totalQuantity = rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Narcotic register"
          description="DDA controlled-substance dispensing log with patient, prescriber and prescription details."
          icon={FileText}
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} disabled={totalItems === 0}>
                <Printer aria-hidden />
                Print
              </Button>
              <Button
                onClick={() => void handleDownloadCsv()}
                disabled={!dateRange || totalItems === 0}
                loading={isDownloading}
                loadingText="Exporting…"
              >
                <Download aria-hidden />
                Export CSV
              </Button>
            </>
          }
        />

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-base">Register filters</CardTitle>
            <CardDescription>
              Choose the period and narrow by medicine, doctor or schedule, then apply before exporting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void fetchRows(1)
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label>Period</Label>
                <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="medicineName">Medicine</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="medicineName"
                    placeholder="Medicine name"
                    value={medicineName}
                    onChange={(e) => setMedicineName(e.target.value)}
                    className="w-full pl-8 sm:w-52"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doctorName">Doctor</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="doctorName"
                    placeholder="Doctor name"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className="w-full pl-8 sm:w-52"
                  />
                </div>
              </div>
              <BranchFilterSelect filter={branchFilter} id="dda-branch" className="flex flex-col gap-1.5 space-y-0" />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="schedule">Schedule</Label>
                <Input
                  id="schedule"
                  placeholder="e.g. II, III"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-32"
                  aria-describedby="schedule-help"
                />
              </div>
              <Button type="submit" variant="outline" loading={isLoading}>
                {!isLoading && <Filter aria-hidden />}
                Apply filters
              </Button>
            </form>
            <p id="schedule-help" className="mt-2 text-xs text-muted-foreground">
              Schedule is the DDA drug schedule (e.g. II, III). Leave blank to include all controlled substances.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="font-display text-base">Dispensing log</CardTitle>
              <CardDescription>Columns follow the DDA register format.</CardDescription>
            </div>
            {!isLoading && !loadError && totalItems > 0 && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="muted" className="num">
                  {totalItems} {totalItems === 1 ? "entry" : "entries"}
                </Badge>
                <Badge variant="info" className="num">
                  {totalQuantity} units dispensed (this page)
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardContent>{isLoading ? <SkeletonTable rows={8} cols={8} /> : renderTable()}</CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
