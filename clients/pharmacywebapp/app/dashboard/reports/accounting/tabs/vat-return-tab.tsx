"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarRange,
  CheckCircle2,
  Download,
  FileText,
  Landmark,
  Printer,
  Receipt,
  RefreshCw,
  Scale,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonText } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid, type StatTone } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCanPostVouchers } from "@/features/accounting/hooks/use-account-permissions"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useVatReturn } from "@/features/accounting/hooks/use-accounting-reports"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { RecordVatPaymentDialog } from "@/features/accounting/components/record-vat-payment-dialog"
import { downloadCsv } from "@/features/accounting/lib/csv"
import {
  bsMonthLabel,
  bsMonthOfRange,
  bsMonthRangeOf,
  formatBsLong,
  formatRangeLabel,
  recentBsMonths,
  type BsMonth,
} from "@/features/accounting/lib/date-presets"
import { buildTaxReportPrintHtml } from "@/features/accounting/lib/ird-print"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { isZeroAmount, vatComputationLines, vatSummaryCsvRows } from "@/features/accounting/lib/vat-summary"
import {
  irdReconciliationRows,
  irdReconciliationWarning,
  irdReturnCsvRows,
  irdReturnPrintRows,
  irdTurnoverSections,
  irdVatComputation,
  type IrdReturnOutcome,
  type IrdRowKind,
} from "@/features/accounting/lib/vat-ird-return"
import {
  BalanceStatus,
  FetchingIndicator,
  InlineAlert,
  QueryState,
  ScrollTable,
  SectionHeading,
  stickyHeaderClass,
  totalsRowClass,
} from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

interface VatReturnTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

const OUTCOME_STYLE: Record<IrdReturnOutcome, { icon: LucideIcon; tone: StatTone; chip: string; label: string; hint: string }> = {
  payable: {
    icon: ArrowUpRight,
    tone: "warning",
    chip: "border-warning/30 bg-warning/10 text-foreground [&>svg]:text-warning",
    label: "VAT payable to IRD",
    hint: "File the return and pay within 25 days of the end of the month.",
  },
  credit: {
    icon: ArrowDownLeft,
    tone: "success",
    chip: "border-success/30 bg-success/10 text-foreground [&>svg]:text-success",
    label: "Credit carried forward",
    hint: "Input VAT exceeds output VAT. The credit is set against next month's VAT.",
  },
  nil: {
    icon: CheckCircle2,
    tone: "default",
    chip: "border-border bg-muted text-foreground [&>svg]:text-muted-foreground",
    label: "Nil return",
    hint: "Nothing to pay and no credit to carry. A nil return still has to be filed.",
  },
}

/** "custom" = a range that is not exactly one BS month (set it with the period filter above). */
const CUSTOM = "custom"
const monthKey = (m: BsMonth) => `${m.year}-${m.month0}`

const rowClass: Record<IrdRowKind, string> = {
  line: "",
  less: "text-muted-foreground",
  total: "font-semibold",
}

export default function VatReturnTab({ dateRange, branchFilterId }: VatReturnTabProps) {
  const { toast } = useToast()
  const { money, amount } = useAccountingMoney()
  const { rangeStr, branchName, setDateRange } = useAccountingContext()
  const { profile } = usePharmacyProfile()
  const vat = useVatReturn({ from: rangeStr.from, to: rangeStr.to, branchId: branchFilterId || undefined }, !!dateRange)
  const r = vat.data
  const ird = r?.ird ?? null
  const [payOpen, setPayOpen] = useState(false)
  // Recording a VAT payment posts a voucher: offered only to users the API would let do it.
  const canPostVouchers = useCanPostVouchers()

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
  const adLabel = formatRangeLabel(dateRange)
  const periodTitle = selectedMonth ? `${bsMonthLabel(selectedMonth)} (BS)` : `BS ${bsLabel}`

  const sections = ird ? irdTurnoverSections(ird) : []
  const computation = r && ird ? irdVatComputation(r, ird) : null
  const outcome: IrdReturnOutcome = computation?.outcome ?? "nil"
  const style = OUTCOME_STYLE[outcome]
  const reconciliation = ird ? irdReconciliationRows(ird) : []
  const reconciliationWarning = ird ? irdReconciliationWarning(ird, money) : null
  const legacy = r && !ird ? vatComputationLines(r) : null
  // Pre-fill a payment with what is owed at the period end (the API caps it at the payable on the payment date).
  const suggestedPayment = ird ? Math.max(0, ird.carry_forward.closing_position) : r && r.net_vat_payable > 0 ? r.net_vat_payable : null

  const exportCsv = () => {
    if (!r) return
    const context = [
      ["Period", "AD", `${r.period_from} to ${r.period_to}`, "", ""],
      ["Period", "BS", bsLabel, "", ""],
      ["Branch", "", branchLabel, "", ""],
    ]
    if (ird) {
      downloadCsv(`vat-return-${r.period_from}-to-${r.period_to}.csv`, ["Section", "Line", "Value / amount", "VAT", "Note"], [
        ...context,
        ...irdReturnCsvRows(r, ird),
        ["Trial balance", "", r.trial_balance_ok ? "Balanced" : "Out of balance", "", ""],
      ])
    } else {
      downloadCsv(`vat-return-${r.period_from}-to-${r.period_to}.csv`, ["Line", "Basis", "Amount"], [
        ...context.map((c) => [c[0], c[1], c[2]]),
        ...vatSummaryCsvRows(r),
      ])
    }
  }

  const print = async () => {
    if (!r) return
    const organisation = profile.panVat ? `${profile.name} · PAN/VAT ${profile.panVat}` : profile.name
    const subtitle = [`Period: ${periodTitle} · ${adLabel}`, `Branch: ${branchLabel}`]
    try {
      if (ird && computation) {
        const { rows, sectionRowIndexes } = irdReturnPrintRows(r, ird, amount)
        const footnote = [
          reconciliationWarning ? `Register/ledger difference — ${reconciliationWarning}` : "Registers agree with the ledger",
          r.trial_balance_ok ? "Trial balance balanced" : "Warning: trial balance out of balance",
          "Exports and imports are not recorded in this system",
        ].join(" · ")
        await printHtmlDocument(
          buildTaxReportPrintHtml({
            title: "VAT return (IRD monthly)",
            organisation,
            subtitle: [...subtitle, `Result: ${style.label}`],
            headers: ["Particulars", "Taxable value", "VAT"],
            numeric: [false, true, true],
            rows,
            sectionRowIndexes,
            totals: [computation.result.label, null, amount(computation.result.amount)],
            footnote,
          })
        )
      } else if (legacy) {
        await printHtmlDocument(
          buildTaxReportPrintHtml({
            title: "VAT return summary",
            organisation,
            subtitle,
            headers: ["Line", "Basis", "Amount"],
            numeric: [false, false, true],
            rows: legacy.lines.map((l) => [l.label, l.basis, amount(l.amount)]),
            totals: [legacy.net.label, legacy.net.basis, amount(Math.abs(legacy.net.amount))],
            footnote: r.trial_balance_ok ? "Trial balance balanced" : "Warning: trial balance out of balance",
          })
        )
      }
    } catch (e) {
      toast({ title: "Print failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    }
  }

  const OutcomeIcon = style.icon

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Select value={monthValue} onValueChange={pickMonth}>
            <SelectTrigger className="w-full sm:w-[200px]" aria-label="VAT period (BS month)">
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
                  <span className="num">({adLabel})</span>
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
          <FetchingIndicator active={vat.isFetching && !vat.isLoading} />
          {canPostVouchers && (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Landmark aria-hidden />
              Record VAT payment
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void print()} disabled={!r}>
            <Printer aria-hidden />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!r}>
            <Download aria-hidden />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void vat.refetch()} aria-label="Refresh VAT return">
            <RefreshCw aria-hidden />
          </Button>
        </div>
      </div>

      <StatGrid cols={3}>
        <StatCard
          label="Sales (excl. VAT)"
          value={ird ? money(ird.sales.net_total) : "—"}
          hint={ird ? `Output VAT ${money(ird.sales.net_output_vat)}` : "From the IRD sales register"}
          icon={ArrowUpRight}
          tone="info"
          loading={vat.isLoading}
        />
        <StatCard
          label="Purchases (excl. VAT)"
          value={ird ? money(ird.purchases.net_total) : "—"}
          hint={ird ? `Input VAT ${money(ird.purchases.net_input_vat)}` : "From the IRD purchase register"}
          icon={ArrowDownLeft}
          loading={vat.isLoading}
        />
        <StatCard
          label={style.label}
          value={computation ? money(computation.result.amount) : r ? money(Math.abs(r.net_vat_payable)) : "—"}
          hint={
            ird && !isZeroAmount(ird.carry_forward.credit_brought_forward)
              ? `After ${money(ird.carry_forward.credit_brought_forward)} credit brought forward`
              : "Output VAT − input VAT"
          }
          icon={Wallet}
          tone={style.tone}
          loading={vat.isLoading}
        />
      </StatGrid>

      <Card className="gap-0 py-0">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <SectionHeading
            icon={Receipt}
            title={`VAT return · ${periodTitle}`}
            description="IRD monthly layout. Turnover from the IRD sales and purchase registers; VAT from the ledger."
          />
          <QueryState
            isLoading={vat.isLoading}
            error={vat.error}
            onRetry={() => void vat.refetch()}
            retrying={vat.isFetching}
            errorTitle="Couldn't load the VAT return"
            skeleton={<SkeletonText lines={8} />}
            isEmpty={!r}
            empty={{
              icon: Receipt,
              title: "Choose a period",
              description: "Pick the BS month you are filing for to prepare the IRD VAT return.",
            }}
          >
            {r && (
              <div className="space-y-5">
                {computation && (
                  <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-3 text-sm sm:px-4", style.chip)}>
                    <OutcomeIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {style.label}
                        {outcome !== "nil" && <span className="num font-display"> · {money(computation.result.amount)}</span>}
                      </p>
                      <p className="text-muted-foreground">{style.hint}</p>
                    </div>
                  </div>
                )}

                {reconciliationWarning && (
                  <InlineAlert tone="warning" title="Registers and ledger disagree">
                    {reconciliationWarning}. Find the document posted to one side only (a manual journal on a VAT
                    account, an unposted sale or purchase, VAT on an expense) before filing.
                  </InlineAlert>
                )}
                {!r.trial_balance_ok && (
                  <InlineAlert tone="destructive" title="Trial balance is not balanced">
                    Fix the books before filing — VAT figures may be unreliable.
                  </InlineAlert>
                )}
                {ird && !isZeroAmount(ird.sales.unclassified) && (
                  <InlineAlert tone="warning" title="Sales without a VAT breakdown">
                    {money(ird.sales.unclassified)} of sales were recorded before VAT was tracked per invoice, so they
                    can&apos;t be split into taxable and exempt. Review them before filing.
                  </InlineAlert>
                )}
                {ird && !isZeroAmount(ird.carry_forward.unpaid_brought_forward) && (
                  <InlineAlert tone="info" title="Unpaid VAT from earlier periods">
                    {money(ird.carry_forward.unpaid_brought_forward)} of VAT from earlier returns was still unpaid when this
                    period started. It is not part of this return.
                  </InlineAlert>
                )}

                {ird && computation ? (
                  <>
                    <ScrollTable label="Sales and purchases" maxHeight="max-h-none">
                      <TableHeader className={stickyHeaderClass}>
                        <TableRow>
                          <TableHead>Particulars</TableHead>
                          <TableHead className="text-right">Taxable value</TableHead>
                          <TableHead className="text-right">VAT</TableHead>
                        </TableRow>
                      </TableHeader>
                      {sections.map((section) => (
                        <TableBody key={section.key}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={3} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {section.title}
                            </TableCell>
                          </TableRow>
                          {[...section.rows, section.total].map((row) => (
                            <TableRow key={row.key} className={cn(row.kind === "total" && totalsRowClass)}>
                              <TableCell className={cn("py-2.5", rowClass[row.kind])}>
                                <span className={cn(row.kind !== "less" && "text-foreground")}>{row.label}</span>
                                {row.note && <span className="block text-xs font-normal text-muted-foreground">{row.note}</span>}
                              </TableCell>
                              <TableCell className={cn("num whitespace-nowrap py-2.5 text-right", rowClass[row.kind])}>
                                {amount(row.value)}
                              </TableCell>
                              <TableCell className={cn("num whitespace-nowrap py-2.5 text-right", rowClass[row.kind])}>
                                {row.vat == null ? "—" : amount(row.vat)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      ))}
                    </ScrollTable>

                    <ScrollTable label="VAT computation" maxHeight="max-h-none">
                      <TableHeader className={stickyHeaderClass}>
                        <TableRow>
                          <TableHead>VAT computation</TableHead>
                          <TableHead className="hidden sm:table-cell">Basis</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {computation.lines.map((l) => (
                          <TableRow key={l.key} className={cn(l.kind === "total" && "font-medium")}>
                            <TableCell className={cn("py-2.5", rowClass[l.kind])}>
                              {l.label}
                              <span className="block text-xs font-normal text-muted-foreground sm:hidden">{l.basis}</span>
                            </TableCell>
                            <TableCell className="hidden py-2.5 text-muted-foreground sm:table-cell">{l.basis}</TableCell>
                            <TableCell className={cn("num whitespace-nowrap py-2.5 text-right", rowClass[l.kind])}>
                              {amount(l.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className={totalsRowClass}>
                          <TableCell>
                            {computation.result.label}
                            <span className="block text-xs font-normal text-muted-foreground sm:hidden">{computation.result.basis}</span>
                          </TableCell>
                          <TableCell className="hidden font-normal text-muted-foreground sm:table-cell">{computation.result.basis}</TableCell>
                          <TableCell className="num whitespace-nowrap text-right font-display text-base">
                            {amount(computation.result.amount)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </ScrollTable>

                    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-3">
                      {[
                        { label: "VAT paid to IRD in the period", value: money(ird.carry_forward.vat_paid_in_period), hint: "Net of refunds received" },
                        {
                          label: ird.carry_forward.closing_position < 0 ? "Credit at period end" : "VAT owed at period end",
                          value: money(Math.abs(ird.carry_forward.closing_position)),
                          hint: "Ledger VAT position after payments",
                        },
                        { label: "Credit brought forward", value: money(ird.carry_forward.credit_brought_forward), hint: "Excess input VAT before this period" },
                      ].map((item) => (
                        <div key={item.label} className="bg-card px-4 py-3">
                          <dt className="text-xs text-muted-foreground">{item.label}</dt>
                          <dd className="num font-display text-base font-semibold">{item.value}</dd>
                          <dd className="text-xs text-muted-foreground">{item.hint}</dd>
                        </div>
                      ))}
                    </dl>

                    <section className="space-y-2" aria-labelledby="vat-reconciliation-heading">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h3
                          id="vat-reconciliation-heading"
                          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          <Scale className="h-3.5 w-3.5" aria-hidden />
                          Registers vs ledger
                        </h3>
                        <Button variant="outline" size="sm" asChild className="shrink-0 self-start">
                          <Link href="/dashboard/reports/accounting/vat?view=ird">
                            <FileText aria-hidden />
                            Open IRD registers
                          </Link>
                        </Button>
                      </div>
                      <dl className="divide-y rounded-lg border text-sm">
                        {reconciliation.map((row) => (
                          <div key={row.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <dt>
                              <span className="font-medium">{row.label}</span>
                              <span className="num block text-xs text-muted-foreground">
                                Registers {amount(row.register)} · Ledger {amount(row.ledger)}
                              </span>
                            </dt>
                            <dd>
                              <BalanceStatus
                                balanced={row.matches}
                                difference={row.difference}
                                balancedLabel="Matches the ledger"
                                unbalancedPrefix="Differs from ledger by"
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-xs text-muted-foreground">
                        Export (zero-rated) sales and imports are not recorded in this system and show as 0.
                      </p>
                    </section>
                  </>
                ) : (
                  legacy && (
                    <ScrollTable label="VAT return computation" maxHeight="max-h-none">
                      <TableHeader className={stickyHeaderClass}>
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead className="hidden sm:table-cell">Basis</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {legacy.lines.map((l) => (
                          <TableRow key={l.key}>
                            <TableCell className="py-2.5 font-medium">{l.label}</TableCell>
                            <TableCell className="hidden py-2.5 text-muted-foreground sm:table-cell">{l.basis}</TableCell>
                            <TableCell className="num whitespace-nowrap py-2.5 text-right">{amount(l.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className={totalsRowClass}>
                          <TableCell>{legacy.net.label}</TableCell>
                          <TableCell className="hidden font-normal text-muted-foreground sm:table-cell">{legacy.net.basis}</TableCell>
                          <TableCell className="num whitespace-nowrap text-right font-display text-base">
                            {amount(Math.abs(legacy.net.amount))}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </ScrollTable>
                  )
                )}
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>

      {payOpen && canPostVouchers && (
        <RecordVatPaymentDialog
          open
          onOpenChange={setPayOpen}
          suggestedAmount={suggestedPayment && suggestedPayment > 0 ? suggestedPayment : null}
        />
      )}
    </div>
  )
}
