"use client"

import { useState } from "react"
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
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid, type StatTone } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useVatReturn } from "@/features/accounting/hooks/use-accounting-reports"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { RecordVatPaymentDialog } from "@/features/accounting/components/record-vat-payment-dialog"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsLong, formatRangeLabel } from "@/features/accounting/lib/date-presets"
import { buildTaxReportPrintHtml } from "@/features/accounting/lib/ird-print"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import {
  hasOperationalCrossCheck,
  isZeroAmount,
  vatComputationLines,
  vatPosition,
  vatPositionCopy,
  vatSummaryCsvRows,
  type VatPosition,
} from "@/features/accounting/lib/vat-summary"
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

const POSITION_STYLE: Record<VatPosition, { icon: LucideIcon; tone: StatTone; chip: string }> = {
  payable: { icon: ArrowUpRight, tone: "warning", chip: "border-warning/30 bg-warning/10 text-foreground [&>svg]:text-warning" },
  refundable: { icon: ArrowDownLeft, tone: "success", chip: "border-success/30 bg-success/10 text-foreground [&>svg]:text-success" },
  nil: { icon: CheckCircle2, tone: "default", chip: "border-border bg-muted text-foreground [&>svg]:text-muted-foreground" },
}

export default function VatReturnTab({ dateRange, branchFilterId }: VatReturnTabProps) {
  const { toast } = useToast()
  const { money, amount } = useAccountingMoney()
  const { rangeStr, branchName } = useAccountingContext()
  const { profile } = usePharmacyProfile()
  const vat = useVatReturn({ from: rangeStr.from, to: rangeStr.to, branchId: branchFilterId || undefined }, !!dateRange)
  const r = vat.data
  const [payOpen, setPayOpen] = useState(false)

  const branchLabel = branchName ?? "All branches"
  const bsLabel = dateRange ? `${formatBsLong(rangeStr.from)} – ${formatBsLong(rangeStr.to)}` : ""
  const adLabel = formatRangeLabel(dateRange)

  const position = r ? vatPosition(r.net_vat_payable) : "nil"
  const copy = vatPositionCopy(position)
  const style = POSITION_STYLE[position]
  const computation = r ? vatComputationLines(r) : null
  const crossCheck = r ? hasOperationalCrossCheck(r) : false
  const noInputVat = r ? isZeroAmount(r.input_vat_gl) && isZeroAmount(r.input_vat_operational) : false

  const exportCsv = () => {
    if (!r) return
    downloadCsv(`vat-return-${r.period_from}-to-${r.period_to}.csv`, ["Line", "Basis", "Amount"], [
      ["Period (AD)", "", `${r.period_from} to ${r.period_to}`],
      ["Period (BS)", "", bsLabel],
      ["Branch", "", branchLabel],
      ...vatSummaryCsvRows(r),
    ])
  }

  const print = async () => {
    if (!r || !computation) return
    try {
      await printHtmlDocument(
        buildTaxReportPrintHtml({
          title: "VAT return summary",
          organisation: profile.panVat ? `${profile.name} · PAN/VAT ${profile.panVat}` : profile.name,
          subtitle: [`Period: ${adLabel}${bsLabel ? ` (BS ${bsLabel})` : ""}`, `Branch: ${branchLabel}`, `Status: ${copy.label}`],
          headers: ["Line", "Basis", "Amount"],
          numeric: [false, false, true],
          rows: computation.lines.map((l) => [l.label, l.basis, amount(l.amount)]),
          totals: [computation.net.label, computation.net.basis, amount(Math.abs(computation.net.amount))],
          footnote: r.trial_balance_ok ? "Trial balance balanced" : "Warning: trial balance out of balance",
        })
      )
    } catch (e) {
      toast({ title: "Print failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    }
  }

  const PositionIcon = style.icon

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex flex-wrap items-center gap-2">
          <FetchingIndicator active={vat.isFetching && !vat.isLoading} />
          <Button size="sm" onClick={() => setPayOpen(true)}>
            <Landmark aria-hidden />
            Record VAT payment
          </Button>
          <Button variant="outline" size="sm" onClick={() => void print()} disabled={!r}>
            <Printer aria-hidden />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!r}>
            <Download aria-hidden />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void vat.refetch()} aria-label="Refresh VAT summary">
            <RefreshCw aria-hidden />
          </Button>
        </div>
      </div>

      <StatGrid cols={3}>
        <StatCard
          label="Output VAT"
          value={r ? money(r.output_vat_gl - r.output_vat_adjustments) : "—"}
          hint={
            r && !isZeroAmount(r.output_vat_adjustments)
              ? `Charged ${money(r.output_vat_gl)} · returns ${money(r.output_vat_adjustments)}`
              : "Collected on sales"
          }
          icon={ArrowUpRight}
          tone="info"
          loading={vat.isLoading}
        />
        <StatCard
          label="Input VAT"
          value={r ? money(r.input_vat_gl) : "—"}
          hint="Paid on purchases"
          icon={ArrowDownLeft}
          loading={vat.isLoading}
        />
        <StatCard
          label={copy.netLabel}
          value={r ? money(Math.abs(r.net_vat_payable)) : "—"}
          hint={
            r ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <PositionIcon className="h-3.5 w-3.5" aria-hidden />
                {copy.label}
              </span>
            ) : undefined
          }
          icon={Wallet}
          tone={style.tone}
          loading={vat.isLoading}
        />
      </StatGrid>

      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <SectionHeading
            icon={Receipt}
            title="VAT return computation"
            description="From posted vouchers on the output and input VAT accounts."
          />
          <QueryState
            isLoading={vat.isLoading}
            error={vat.error}
            onRetry={() => void vat.refetch()}
            retrying={vat.isFetching}
            errorTitle="Couldn't load the VAT summary"
            skeleton={<SkeletonText lines={6} />}
            isEmpty={!r}
            empty={{
              icon: Receipt,
              title: "Choose a period",
              description: "Pick the VAT period above (usually one BS month) to prepare your IRD return.",
            }}
          >
            {r && computation && (
              <div className="space-y-4">
                <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-3 text-sm sm:px-4", style.chip)}>
                  <PositionIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {copy.label}
                      {position !== "nil" && <span className="num font-display"> · {money(Math.abs(r.net_vat_payable))}</span>}
                    </p>
                    <p className="text-muted-foreground">{copy.hint}</p>
                  </div>
                </div>

                {!isZeroAmount(r.vat_settled) && (
                  <InlineAlert tone="info">
                    {money(r.vat_settled)} of VAT was paid to IRD in this period. Payments settle VAT already owed and are
                    not part of this return.
                  </InlineAlert>
                )}
                {!r.trial_balance_ok && (
                  <InlineAlert tone="destructive" title="Trial balance is not balanced">
                    Fix the books before filing — VAT figures may be unreliable.
                  </InlineAlert>
                )}
                {noInputVat && (
                  <InlineAlert tone="info">
                    No input VAT is recorded for this period. If you claim input VAT on purchases, check that purchase
                    bills carry their VAT before filing.
                  </InlineAlert>
                )}

                <ScrollTable label="VAT return computation" maxHeight="max-h-none">
                  <TableHeader className={stickyHeaderClass}>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead className="hidden sm:table-cell">Basis</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {computation.lines.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell className="py-2.5">
                          <span className="font-medium">{l.label}</span>
                          <span className="block text-xs text-muted-foreground sm:hidden">{l.basis}</span>
                        </TableCell>
                        <TableCell className="hidden py-2.5 text-muted-foreground sm:table-cell">{l.basis}</TableCell>
                        <TableCell className={cn("num whitespace-nowrap py-2.5 text-right", l.amount < 0 && "text-muted-foreground")}>
                          {amount(l.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className={totalsRowClass}>
                      <TableCell>
                        {computation.net.label}
                        <span className="block text-xs font-normal text-muted-foreground sm:hidden">{computation.net.basis}</span>
                      </TableCell>
                      <TableCell className="hidden font-normal text-muted-foreground sm:table-cell">{computation.net.basis}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right font-display text-base">
                        {amount(Math.abs(computation.net.amount))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </ScrollTable>

                <section className="space-y-2" aria-labelledby="vat-crosscheck-heading">
                  <h3 id="vat-crosscheck-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cross-check with sales &amp; purchase records
                  </h3>
                  {crossCheck ? (
                    <dl className="divide-y rounded-lg border text-sm">
                      {[
                        { label: "Output VAT per sales records", op: r.output_vat_operational, diff: r.gl_vs_operational_output_diff },
                        { label: "Input VAT per purchase records", op: r.input_vat_operational, diff: r.gl_vs_operational_input_diff },
                      ].map((row) => (
                        <div key={row.label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <dt>
                            <span className="font-medium">{row.label}</span>
                            <span className="num block text-xs text-muted-foreground">{amount(row.op)}</span>
                          </dt>
                          <dd>
                            <BalanceStatus
                              balanced={isZeroAmount(row.diff)}
                              difference={row.diff}
                              balancedLabel="Matches the ledger"
                              unbalancedPrefix="Differs from ledger by"
                            />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <p>
                        Compare these ledger figures with the VAT on your IRD sales and purchase registers before
                        filing.
                      </p>
                      <Button variant="outline" size="sm" asChild className="shrink-0">
                        <Link href="/dashboard/reports/accounting/vat?view=ird">
                          <FileText aria-hidden />
                          Open IRD registers
                        </Link>
                      </Button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>

      {payOpen && (
        <RecordVatPaymentDialog
          open
          onOpenChange={setPayOpen}
          suggestedAmount={r && r.net_vat_payable > 0 ? r.net_vat_payable : null}
        />
      )}
    </div>
  )
}
