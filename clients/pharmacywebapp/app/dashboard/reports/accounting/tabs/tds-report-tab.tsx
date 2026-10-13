"use client"

import { useMemo, useState } from "react"
import { Building2, CalendarRange, Download, Landmark, Percent, ReceiptText, RefreshCw, Scale, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useCanPostVouchers } from "@/features/accounting/hooks/use-account-permissions"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useTdsReport } from "@/features/accounting/hooks/use-tds"
import { RecordTdsPaymentDialog } from "@/features/accounting/components/record-tds-payment-dialog"
import { downloadCsv } from "@/features/accounting/lib/csv"
import {
  bsMonthLabel,
  bsMonthOfRange,
  bsMonthRangeOf,
  formatBsLong,
  formatBsYmd,
  formatRangeLabel,
  recentBsMonths,
  type BsMonth,
} from "@/features/accounting/lib/date-presets"
import { ETDS_CSV_HEADERS, etdsCsvRows, linesMissingPan, tdsCategoryTotalsCsvRows } from "@/features/accounting/lib/tds"
import {
  FetchingIndicator,
  InlineAlert,
  QueryState,
  ScrollTable,
  SectionHeading,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

interface TdsReportTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

const CUSTOM = "custom"
const monthKey = (m: BsMonth) => `${m.year}-${m.month0}`

const SOURCE_LABEL: Record<string, string> = { Expense: "Expense", SupplierPayment: "Supplier payment" }

/**
 * Accounting › Tax & IRD › TDS: tax deducted at source in a BS month — every deduction (vendor, PAN, category,
 * taxable amount, rate, TDS, document), totals per category, what was deposited with IRD and what is still payable.
 * Exports a CSV laid out like IRD's e-TDS upload, and records a TDS deposit (Dr TDS Payable / Cr Bank).
 */
export default function TdsReportTab({ dateRange, branchFilterId }: TdsReportTabProps) {
  const { money, amount } = useAccountingMoney()
  const { rangeStr, branchName, setDateRange } = useAccountingContext()
  const report = useTdsReport({ from: rangeStr.from, to: rangeStr.to, branchId: branchFilterId || undefined }, !!dateRange)
  const r = report.data
  const canPostVouchers = useCanPostVouchers()
  const [payOpen, setPayOpen] = useState(false)

  const months = useMemo(() => recentBsMonths(new Date(), 24), [])
  const selectedMonth = bsMonthOfRange(dateRange)
  const monthValue = selectedMonth ? monthKey(selectedMonth) : CUSTOM
  const monthOptions =
    selectedMonth && !months.some((m) => monthKey(m) === monthKey(selectedMonth)) ? [selectedMonth, ...months] : months
  const pickMonth = (value: string) => {
    const m = monthOptions.find((o) => monthKey(o) === value)
    if (m) setDateRange(bsMonthRangeOf(m))
  }

  const branchLabel = branchName ?? "All branches"
  const bsLabel = dateRange ? `${formatBsLong(rangeStr.from)} – ${formatBsLong(rangeStr.to)}` : ""
  const periodTitle = selectedMonth ? `${bsMonthLabel(selectedMonth)} (BS)` : `BS ${bsLabel}`
  const missingPan = r ? linesMissingPan(r.lines) : []

  const exportCsv = () => {
    if (!r) return
    downloadCsv(`e-tds-${rangeStr.from}-to-${rangeStr.to}.csv`, [...ETDS_CSV_HEADERS], [...etdsCsvRows(r.lines), ...tdsCategoryTotalsCsvRows(r)])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Select value={monthValue} onValueChange={pickMonth}>
            <SelectTrigger className="w-full sm:w-[200px]" aria-label="TDS period (BS month)">
              <SelectValue placeholder="Choose a BS month" />
            </SelectTrigger>
            <SelectContent>
              {monthValue === CUSTOM && (
                <SelectItem value={CUSTOM} disabled>
                  Custom range
                </SelectItem>
              )}
              {monthOptions.map((m) => (
                <SelectItem key={monthKey(m)} value={monthKey(m)}>
                  {bsMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
              {dateRange ? (
                <>
                  <span className="font-medium text-foreground">BS {bsLabel}</span>
                  <span className="num">({formatRangeLabel(dateRange)})</span>
                </>
              ) : (
                "No period selected"
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden />
              <span className="font-medium text-foreground">{branchLabel}</span>
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FetchingIndicator active={report.isFetching && !report.isLoading} />
          {canPostVouchers && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Landmark aria-hidden />
              Record TDS payment
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!r || r.lines.length === 0}>
            <Download aria-hidden />
            e-TDS CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void report.refetch()} aria-label="Refresh TDS report">
            <RefreshCw aria-hidden />
          </Button>
        </div>
      </div>

      <StatGrid cols={3}>
        <StatCard
          label="TDS deducted"
          value={r ? money(r.total_tds) : "—"}
          hint={r ? `${r.lines.length} deduction${r.lines.length === 1 ? "" : "s"} on ${money(r.total_taxable)}` : "In the period"}
          icon={Percent}
          tone="info"
          loading={report.isLoading}
        />
        <StatCard
          label="Deposited with IRD"
          value={r ? money(r.tds_deposited) : "—"}
          hint="TDS payments dated in the period"
          icon={Landmark}
          loading={report.isLoading}
        />
        <StatCard
          label="TDS payable"
          value={r ? money(r.tds_payable_balance) : "—"}
          hint="Balance at the period end (all branches)"
          icon={Wallet}
          tone={r && r.tds_payable_balance > 0.005 ? "warning" : "default"}
          loading={report.isLoading}
        />
      </StatGrid>

      <Card className="gap-0 py-0">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <SectionHeading
            icon={ReceiptText}
            title={`TDS deducted · ${periodTitle}`}
            description="Withheld from expenses and supplier payments, on the amount excluding VAT. Deposit it with IRD by the 25th of the next month."
          />
          <QueryState
            isLoading={report.isLoading}
            error={report.error}
            onRetry={() => void report.refetch()}
            retrying={report.isFetching}
            errorTitle="Couldn't load the TDS report"
            isEmpty={!r || r.lines.length === 0}
            empty={{
              icon: Percent,
              title: "No TDS deducted in this period",
              description: "Choose a TDS category on an expense or a supplier payment to withhold tax at source.",
            }}
          >
            {r && (
              <div className="space-y-5">
                {missingPan.length > 0 && (
                  <InlineAlert tone="warning" title={`${missingPan.length} deduction${missingPan.length === 1 ? "" : "s"} without a PAN`}>
                    The e-TDS upload needs the withholdee&apos;s PAN. Add the vendor&apos;s VAT / PAN number on the expense, or the
                    supplier&apos;s PAN on the supplier, before uploading.
                  </InlineAlert>
                )}

                <ScrollTable label="TDS deductions">
                  <TableHeader className={stickyHeaderClass}>
                    <TableRow>
                      <TableHead>Date (BS)</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="hidden md:table-cell">PAN</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">TDS</TableHead>
                      <TableHead className="hidden lg:table-cell">Document</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="num whitespace-nowrap">
                          {formatBsYmd(l.date)}
                          <span className="block text-xs text-muted-foreground">{l.date}</span>
                        </TableCell>
                        <TableCell className="min-w-[10rem]">
                          {l.vendor_name}
                          <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[l.source_type] ?? l.source_type}</span>
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs md:table-cell">{l.pan ?? "—"}</TableCell>
                        <TableCell>{l.category_name}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right">{amount(l.taxable_amount)}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right">{l.rate_percent}%</TableCell>
                        <TableCell className="num whitespace-nowrap text-right font-medium">{amount(l.tds_amount)}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{l.document_reference ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className={stickyFooterClass}>
                    <TableRow className={totalsRowClass}>
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(r.total_taxable)}</TableCell>
                      <TableCell />
                      <TableCell className="num whitespace-nowrap text-right">{amount(r.total_tds)}</TableCell>
                      <TableCell className="hidden lg:table-cell" />
                    </TableRow>
                  </TableFooter>
                </ScrollTable>

                <ScrollTable label="TDS by category" maxHeight="max-h-none">
                  <TableHeader className={stickyHeaderClass}>
                    <TableRow>
                      <TableHead>By category</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">TDS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.category_totals.map((t) => (
                      <TableRow key={t.category_code}>
                        <TableCell>{t.category_name}</TableCell>
                        <TableCell className="num text-right">{t.count}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right">{amount(t.taxable_amount)}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right font-medium">{amount(t.tds_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </ScrollTable>

                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  The e-TDS CSV lists PAN, name, payment amount (excluding VAT), TDS, the TDS type and the BS date. Match the TDS
                  type to IRD&apos;s TDS head and check the columns against the current e-TDS template before uploading.
                </p>
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>

      {payOpen && (
        <RecordTdsPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          suggestedAmount={r && r.tds_payable_balance > 0 ? r.tds_payable_balance : null}
        />
      )}
    </div>
  )
}
