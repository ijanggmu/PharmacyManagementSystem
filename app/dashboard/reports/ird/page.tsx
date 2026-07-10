"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { DateRangePicker } from "@/components/date-range-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { accountingApi } from "@/features/accounting/api-client"

interface DateRange {
  from: Date
  to: Date
}

type IrdReportType = "sales-register" | "purchase-register" | "annex-13" | "annex-14"

export default function IrdReportsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })
  const [reportType, setReportType] = useState<IrdReportType>("sales-register")
  const [isDownloading, setIsDownloading] = useState(false)
  const [previewRows, setPreviewRows] = useState<any[]>([])
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [vatReconciliation, setVatReconciliation] = useState<Awaited<ReturnType<typeof accountingApi.vatReturn>> | null>(null)

  useEffect(() => {
    if (dateRange) {
      fetchPreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, dateRange])

  // Cross-check the IRD sales-tax figures shown here against the posted accounting
  // ledger — the two are derived from different data paths (raw sales rows vs.
  // posted vouchers) and can drift if a voucher is later voided/corrected. Fails
  // silently if the viewer lacks accounting:read (this is informational, not
  // required for the IRD export itself).
  useEffect(() => {
    if (!dateRange) return
    const from = dateRange.from.toISOString().split("T")[0]
    const to = dateRange.to.toISOString().split("T")[0]
    accountingApi
      .vatReturn(from, to)
      .then(setVatReconciliation)
      .catch(() => setVatReconciliation(null))
  }, [dateRange])

  const buildParams = (format: "json" | "csv") => {
    if (!dateRange) return ""
    const params = new URLSearchParams({
      type: reportType,
      periodStart: dateRange.from.toISOString().split("T")[0],
      periodEnd: dateRange.to.toISOString().split("T")[0],
      format,
    })
    return params.toString()
  }

  const fetchPreview = async () => {
    if (!dateRange) return
    setIsLoadingPreview(true)
    try {
      const params = buildParams("json")
      const res = await fetch(`/api/reports/ird?${params}`)
      if (!res.ok) {
        throw new Error("Failed to load IRD report preview")
      }
      const body = await res.json()
      setPreviewRows(body.data?.rows ?? [])
    } catch (error: any) {
      toast({
        title: "Failed to load preview",
        description: error.message || "Could not load IRD report preview.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const handleDownloadCsv = async () => {
    if (!dateRange) return
    setIsDownloading(true)
    try {
      const params = buildParams("csv")
      const res = await fetch(`/api/reports/ird?${params}`)
      if (!res.ok) {
        throw new Error("Failed to download IRD CSV")
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `ird-${reportType}-${dateRange.from.toISOString().split("T")[0]}-to-${dateRange.to
        .toISOString()
        .split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast({
        title: "Export started",
        description: "IRD CSV has been generated.",
      })
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Could not export IRD CSV.",
        variant: "destructive",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const orderedColumns = (row: Record<string, unknown>, report: IrdReportType): string[] => {
    const keys = Object.keys(row)
    const preferred: Record<IrdReportType, string[]> = {
      "sales-register": [
        "sale_date",
        "sale_number",
        "invoice_number",
        "customer_name",
        "customer_phone",
        "total_amount",
        "tax_amount",
        "payment_method",
        "ird_status",
      ],
      "annex-13": [
        "sale_date",
        "sale_number",
        "invoice_number",
        "customer_name",
        "customer_phone",
        "taxable_amount",
        "tax_amount",
        "total_amount",
        "payment_method",
      ],
      "purchase-register": [
        "order_date",
        "order_number",
        "supplier_name",
        "supplier_tax_invoice_numbers",
        "total_amount",
        "status",
      ],
      "annex-14": [
        "order_date",
        "purchase_number",
        "supplier_name",
        "supplier_tax_invoice_numbers",
        "total_amount",
        "status",
      ],
    }
    const want = preferred[report].filter((k) => keys.includes(k))
    const rest = keys.filter((k) => !want.includes(k))
    return [...want, ...rest.sort()]
  }

  const renderPreviewTable = () => {
    if (!previewRows || previewRows.length === 0) {
      return (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No rows for the selected period and report type.
        </div>
      )
    }

    const columns = orderedColumns(previewRows[0] as Record<string, unknown>, reportType)
    const rowsToShow = previewRows.slice(0, 20)

    return (
      <div className="border rounded-lg max-h-96 overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-2 py-2 text-left font-medium text-muted-foreground">
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsToShow.map((row, idx) => (
              <tr key={idx} className="border-t">
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1 whitespace-nowrap">
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">IRD Reports</h1>
            <p className="text-muted-foreground">
              Generate IRD-ready sales and purchase registers (Annex 13 / Annex 14).
            </p>
          </div>
        </div>

        {vatReconciliation && Math.abs(vatReconciliation.gl_vs_operational_output_diff) > 0.01 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-400">
                  IRD sales-tax figures don't match the posted accounting ledger for this period
                </p>
                <p className="mt-1 text-muted-foreground">
                  Output VAT from sales records: <span className="font-medium text-foreground">{vatReconciliation.output_vat_operational.toFixed(2)}</span>
                  {" · "}Output VAT from posted vouchers: <span className="font-medium text-foreground">{vatReconciliation.output_vat_gl.toFixed(2)}</span>
                  {" · "}Difference: <span className="font-medium text-foreground">{vatReconciliation.gl_vs_operational_output_diff.toFixed(2)}</span>.
                  This usually means a sale's accounting voucher was later voided or corrected. Check the Accounting &gt; VAT Return tab before filing.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {vatReconciliation && Math.abs(vatReconciliation.gl_vs_operational_output_diff) <= 0.01 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            IRD sales-tax figures match the posted accounting ledger for this period.
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Export IRD Registers</CardTitle>
                <CardDescription>
                  Choose report type and period, then download as CSV for submission to IRD.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                <Select value={reportType} onValueChange={(v) => setReportType(v as IrdReportType)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select IRD report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales-register">Sales Register (Internal)</SelectItem>
                    <SelectItem value="purchase-register">Purchase Register (Internal)</SelectItem>
                    <SelectItem value="annex-13">Annex 13 – Sales</SelectItem>
                    <SelectItem value="annex-14">Annex 14 – Purchases</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fetchPreview} disabled={isLoadingPreview}>
                  <FileText className="h-4 w-4 mr-2" />
                  Refresh Preview
                </Button>
                <Button onClick={handleDownloadCsv} disabled={isDownloading || !dateRange}>
                  <Download className="h-4 w-4 mr-2" />
                  {isDownloading ? "Downloading..." : "Download CSV"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>
                CSV layout is flattened for IRD import tools. Sales registers include{" "}
                <span className="font-medium text-foreground">invoice_number</span> (tax invoice) and{" "}
                <span className="font-medium text-foreground">sale_number</span> (internal receipt). Purchase
                rows include <span className="font-medium text-foreground">supplier_tax_invoice_numbers</span>{" "}
                from goods receipts when captured at GRN.
              </span>
            </div>
            {isLoadingPreview ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  <p className="mt-2 text-sm text-muted-foreground">Loading preview…</p>
                </div>
              </div>
            ) : (
              renderPreviewTable()
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

