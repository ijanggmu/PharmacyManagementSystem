"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Download,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Printer,
  Receipt,
  RefreshCw,
  Truck,
} from "lucide-react"
import { DateRangePicker } from "@/components/date-range-picker"
import { PageHeader } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  getIrdPurchaseRegister,
  getIrdQueueHealth,
  getIrdSalesRegister,
  type IrdPurchaseRegisterRow,
  type IrdReportType,
  type IrdSalesRegisterRow,
} from "@/lib/api/ird-api"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { exportTableToExcel } from "@/lib/utils/table-export"
import { accountingApi } from "@/features/accounting/api-client"
import {
  FetchingIndicator,
  InlineAlert,
  QueryState,
  ScrollTable,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "@/features/accounting/components/accounting-ui"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsLong, formatRangeLabel, getPresetRange } from "@/features/accounting/lib/date-presets"
import { buildTaxReportPrintHtml } from "@/features/accounting/lib/ird-print"
import {
  ANNEX_13_COLUMNS,
  ANNEX_14_COLUMNS,
  IRD_REGISTERS,
  PURCHASE_REGISTER_COLUMNS,
  SALES_REGISTER_COLUMNS,
  irdRegisterMeta,
  irdRegisterTable,
  irdTableCsvRows,
  vatRegisterCrossCheck,
  type IrdCell,
  type IrdColumn,
  type IrdRegisterSide,
} from "@/features/accounting/lib/ird-registers"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"

interface DateRange {
  from: Date
  to: Date
}

interface IrdReportsPanelProps {
  /**
   * Inside another page's chrome (the Tax & IRD tab): no page header — the actions sit in the panel's
   * own toolbar. Standalone, the panel renders its own page header.
   */
  embedded?: boolean
}

/** Rows rendered in the on-screen table; exports and totals always cover every row. */
const MAX_RENDERED_ROWS = 500

type RegisterData =
  | { side: "sales"; rows: IrdSalesRegisterRow[] }
  | { side: "purchase"; rows: IrdPurchaseRegisterRow[] }

/** IRD sales/purchase registers (Annex 13 / 14): preview with totals, ledger VAT cross-check, export and print. */
export function IrdReportsPanel({ embedded = false }: IrdReportsPanelProps) {
  const { toast } = useToast()
  const { amount, money } = useAccountingMoney()
  const { profile } = usePharmacyProfile()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => getPresetRange("this_bs_month"))
  const [reportType, setReportType] = useState<IrdReportType>("sales-register")
  // Registers are filed per PAN (all branches); ViewAll users may look at one branch, others are pinned.
  const branchFilter = useBranchFilter()
  const branchId = branchFilter.branchId
  const scopeText = branchId ? branchFilter.scopeLabel : "All branches — IRD registers are filed per PAN"

  const meta = irdRegisterMeta(reportType)
  const from = dateRange ? formatLocalDateYmd(dateRange.from) : ""
  const to = dateRange ? formatLocalDateYmd(dateRange.to) : ""
  const enabled = !!dateRange

  // Sales register and Annex 13 read the same rows (likewise purchases), so switching between them is free.
  const register = useQuery<RegisterData>({
    queryKey: ["accounting", "ird-register", meta.side, from, to, branchId ?? ""],
    queryFn: async () =>
      meta.side === "sales"
        ? { side: "sales", rows: await getIrdSalesRegister(from, to, branchId) }
        : { side: "purchase", rows: await getIrdPurchaseRegister(from, to, branchId) },
    enabled,
    staleTime: 60_000,
  })

  // Informational: VAT posted to the ledger for the same period. Hidden if the viewer can't read accounting.
  const ledgerVat = useQuery({
    queryKey: ["accounting", "ird", "ledger-vat", from, to],
    queryFn: () => accountingApi.vatReturn(from, to),
    enabled: enabled && meta.side === "sales",
    staleTime: 60_000,
    retry: false,
  })

  const irdHealth = useQuery({
    queryKey: ["accounting", "ird-queue-health"],
    queryFn: getIrdQueueHealth,
    enabled: meta.side === "sales",
    staleTime: 60_000,
    retry: false,
  })

  const data = register.data?.side === meta.side ? register.data : undefined
  const view = useMemo(() => (data ? buildView(data, reportType) : null), [data, reportType])

  const bsLabel = dateRange ? `${formatBsLong(from)} – ${formatBsLong(to)}` : ""
  const adLabel = formatRangeLabel(dateRange)
  const fileBase = `ird-${reportType}-${from}-to-${to}`
  const canExport = !!view && view.table.rows.length > 0

  const exportCsv = () => {
    if (!view) return
    downloadCsv(`${fileBase}.csv`, view.table.headers, irdTableCsvRows(view.table, view.kinds))
  }

  const exportExcel = () => {
    if (!view) return
    try {
      const rows = irdTableCsvRows(view.table, view.kinds)
      exportTableToExcel(
        rows,
        view.table.headers.map((header, i) => ({ header, value: (row: (string | number | null)[]) => row[i] ?? "" })),
        fileBase,
        meta.badge ?? meta.title
      )
    } catch (e) {
      toast({ title: "Export failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    }
  }

  const print = async () => {
    if (!view) return
    const fmt = (cell: IrdCell, i: number) => (view.kinds[i] === "money" && typeof cell === "number" ? amount(cell) : cell)
    try {
      await printHtmlDocument(
        buildTaxReportPrintHtml({
          title: meta.badge ? `${meta.badge} — ${meta.title}` : meta.title,
          organisation: profile.panVat ? `${profile.name} · PAN/VAT ${profile.panVat}` : profile.name,
          subtitle: [`Period: ${adLabel}${bsLabel ? ` (BS ${bsLabel})` : ""}`, branchId ? branchFilter.scopeLabel : "All branches"],
          headers: view.table.headers,
          numeric: view.kinds.map((k) => k === "money"),
          rows: view.table.rows.map((r) => r.map(fmt)),
          totals: view.table.totals.map(fmt),
        })
      )
    } catch (e) {
      toast({ title: "Print failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    }
  }

  const actions = (
    <>
      <FetchingIndicator active={register.isFetching && !register.isLoading} />
      <Button variant="outline" size="sm" onClick={() => void print()} disabled={!canExport}>
        <Printer aria-hidden />
        Print
      </Button>
      <Button variant="outline" size="sm" onClick={exportExcel} disabled={!canExport}>
        <FileSpreadsheet aria-hidden />
        Excel
      </Button>
      <Button size="sm" onClick={exportCsv} disabled={!canExport}>
        <Download aria-hidden />
        CSV
      </Button>
    </>
  )

  const crossCheck =
    view && view.side === "sales" && view.vatTotal != null && ledgerVat.data
      ? vatRegisterCrossCheck(view.vatTotal, ledgerVat.data.output_vat_gl)
      : null

  return (
    <div className="min-w-0 space-y-4">
      {!embedded && (
        <PageHeader
          title="IRD reports"
          description="IRD-ready sales and purchase registers (Annex 13 / Annex 14) for VAT filing."
          icon={FileText}
          actions={actions}
        />
      )}

      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Filing period</Label>
              <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {embedded && actions}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void register.refetch()}
                disabled={!enabled}
                aria-label="Refresh register"
              >
                <RefreshCw aria-hidden />
              </Button>
            </div>
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
              {dateRange ? (
                <>
                  <span className="font-medium text-foreground">BS {bsLabel}</span>
                  <span className="num">({adLabel})</span>
                </>
              ) : (
                "Choose a filing period"
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden />
              <span>{scopeText}</span>
            </span>
            <BranchFilterSelect filter={branchFilter} id="ird-branch" hideLabel />
          </p>

          <div role="radiogroup" aria-label="IRD register" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {IRD_REGISTERS.map((r) => {
              const selected = r.type === reportType
              const Icon = r.side === "sales" ? Receipt : Truck
              return (
                <button
                  key={r.type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReportType(r.type)}
                  className={cn(
                    "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected && "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/30"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md",
                        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    {r.badge && (
                      <Badge variant="outline" className="shrink-0 text-[10px] font-medium">
                        {r.badge}
                      </Badge>
                    )}
                  </span>
                  <span className="text-sm font-semibold leading-tight text-foreground">{r.title}</span>
                  <span className="line-clamp-2 hidden text-xs text-muted-foreground sm:block">{r.description}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {view && view.table.rows.length > 0 && (
        <StatGrid cols={view.side === "sales" ? 4 : 3}>
          {view.side === "sales" ? (
            <>
              <StatCard label="Invoices" value={view.table.rows.length.toLocaleString()} icon={Receipt} tone="primary" />
              <StatCard
                label="Taxable value"
                value={money(view.taxableTotal ?? 0)}
                hint={view.exemptTotal ? `Excl. VAT · exempt sales ${money(view.exemptTotal)}` : "Excl. VAT"}
              />
              <StatCard label="VAT on sales" value={money(view.vatTotal ?? 0)} tone="info" />
              <StatCard label="Gross sales" value={money(view.grossTotal)} />
            </>
          ) : (
            <>
              <StatCard label="Purchases" value={view.table.rows.length.toLocaleString()} icon={Truck} tone="primary" />
              <StatCard
                label="Purchase value"
                value={money(view.grossTotal)}
                hint={view.exemptTotal ? `Incl. exempt purchases ${money(view.exemptTotal)}` : undefined}
              />
              <StatCard
                label="Missing supplier invoice no."
                value={view.missingInvoiceCount.toLocaleString()}
                hint={view.missingInvoiceCount > 0 ? "Capture them at goods receipt before filing" : "Every purchase has one"}
                icon={view.missingInvoiceCount > 0 ? AlertTriangle : undefined}
                tone={view.missingInvoiceCount > 0 ? "warning" : "success"}
              />
            </>
          )}
        </StatGrid>
      )}

      {crossCheck &&
        (crossCheck.matches ? (
          <InlineAlert tone="success">
            VAT on this register matches output VAT posted to the ledger (<span className="num">{money(crossCheck.ledgerVat)}</span>).
          </InlineAlert>
        ) : (
          <InlineAlert tone="warning" title="Register VAT differs from the posted ledger">
            Register <span className="num">{money(crossCheck.registerVat)}</span> · ledger{" "}
            <span className="num">{money(crossCheck.ledgerVat)}</span> · difference{" "}
            <span className="num font-semibold">{money(crossCheck.difference)}</span>. Returns, refunds or a voided sale
            voucher usually explain it — check before filing.
          </InlineAlert>
        ))}

      {meta.side === "sales" && irdHealth.data && (irdHealth.data.pendingCount > 0 || irdHealth.data.failedCount > 0) && (
        <InlineAlert tone={irdHealth.data.failedCount > 0 ? "warning" : "info"} title="IRD invoice sync">
          {irdHealth.data.pendingCount} pending · {irdHealth.data.failedCount} failed. Invoices not yet accepted by IRD
          still appear in the register.
        </InlineAlert>
      )}

      <Card className="gap-0 py-0">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              {meta.badge ? `${meta.badge} — ${meta.title}` : meta.title}
            </h2>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>
          <QueryState
            isLoading={enabled && (register.isLoading || (!data && register.isFetching))}
            error={register.error}
            onRetry={() => void register.refetch()}
            retrying={register.isFetching}
            errorTitle="Couldn't load the register"
            skeleton={<SkeletonTable rows={8} cols={6} />}
            isEmpty={!enabled || !view || view.table.rows.length === 0}
            empty={
              !enabled
                ? { icon: CalendarRange, title: "Choose a filing period", description: "Pick the period you are filing for." }
                : {
                    icon: FileSearch,
                    title: "No transactions in this period",
                    description: "Nothing to report for this register. Widen the period or pick another register.",
                  }
            }
          >
            {view && <RegisterTable view={view} format={amount} />}
          </QueryState>
        </CardContent>
      </Card>
    </div>
  )
}

interface RegisterView {
  side: IrdRegisterSide
  table: ReturnType<typeof irdRegisterTable>
  kinds: IrdColumn<unknown>["kind"][]
  grossTotal: number
  taxableTotal: number | null
  exemptTotal: number | null
  vatTotal: number | null
  missingInvoiceCount: number
}

function sumAt(totals: IrdCell[], index: number): number | null {
  if (index < 0) return null
  const v = totals[index]
  return typeof v === "number" ? v : null
}

function buildView(data: RegisterData, type: IrdReportType): RegisterView {
  if (data.side === "sales") {
    const columns = type === "annex-13" ? ANNEX_13_COLUMNS : SALES_REGISTER_COLUMNS
    return fromColumns("sales", data.rows, columns, 0)
  }
  const columns = type === "annex-14" ? ANNEX_14_COLUMNS : PURCHASE_REGISTER_COLUMNS
  const missing = data.rows.filter((r) => !r.supplier_tax_invoice_numbers.trim()).length
  return fromColumns("purchase", data.rows, columns, missing)
}

function fromColumns<T>(side: IrdRegisterSide, rows: T[], columns: IrdColumn<T>[], missingInvoiceCount: number): RegisterView {
  const table = irdRegisterTable(rows, columns)
  const keyIndex = (key: string) => columns.findIndex((c) => c.key === key)
  return {
    side,
    table,
    kinds: columns.map((c) => c.kind),
    grossTotal: sumAt(table.totals, keyIndex("total_amount")) ?? 0,
    taxableTotal: sumAt(table.totals, keyIndex("taxable_amount")),
    exemptTotal: sumAt(table.totals, keyIndex("exempt_amount")),
    vatTotal: sumAt(table.totals, keyIndex("tax_amount")),
    missingInvoiceCount,
  }
}

function RegisterTable({ view, format }: { view: RegisterView; format: (n: number) => string }) {
  const shown = view.table.rows.slice(0, MAX_RENDERED_ROWS)
  const isMoney = (i: number) => view.kinds[i] === "money"
  const render = (cell: IrdCell, i: number) => {
    if (cell == null || cell === "") return <span className="text-muted-foreground">—</span>
    return isMoney(i) && typeof cell === "number" ? format(cell) : cell
  }

  return (
    <div className="space-y-2">
      <ScrollTable label="IRD register">
        <TableHeader className={stickyHeaderClass}>
          <TableRow>
            {view.table.headers.map((h, i) => (
              <TableHead key={h} className={cn("whitespace-nowrap", isMoney(i) && "text-right")}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, r) => (
            <TableRow key={r}>
              {row.map((cell, i) => (
                <TableCell
                  key={i}
                  className={cn(
                    "py-2",
                    isMoney(i) && "num whitespace-nowrap text-right",
                    view.kinds[i] === "date" && "num whitespace-nowrap",
                    view.kinds[i] === "text" && "max-w-[240px] truncate"
                  )}
                >
                  {render(cell, i)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className={stickyFooterClass}>
          <TableRow className={totalsRowClass}>
            {view.table.totals.map((cell, i) => (
              <TableCell key={i} className={cn("whitespace-nowrap", isMoney(i) && "num text-right")}>
                {cell == null ? null : isMoney(i) && typeof cell === "number" ? format(cell) : cell}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </ScrollTable>
      {view.table.rows.length > shown.length && (
        <p className="num text-xs text-muted-foreground">
          Showing the first {shown.length} of {view.table.rows.length} rows. Totals, exports and print include every row.
        </p>
      )}
    </div>
  )
}
