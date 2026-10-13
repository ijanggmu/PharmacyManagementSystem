"use client"

import { useState } from "react"
import { ArrowDownUp, Banknote, Building2, ChevronRight, Landmark, RefreshCw, Settings2, Waves } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { cn } from "@/lib/utils"
import type { CashFlowLine } from "@/lib/api/accounting-statements-api"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useAccountPermissions } from "@/features/accounting/hooks/use-account-permissions"
import { useCashFlowStatement } from "@/features/accounting/hooks/use-accounting-reports"
import { CashFlowClassificationDialog } from "@/features/accounting/components/cash-flow-classification-dialog"
import { ReportExportMenu } from "@/features/accounting/components/report-export-menu"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsLong, formatRangeLabel } from "@/features/accounting/lib/date-presets"
import { cashFlowDocument } from "@/features/accounting/lib/statement-documents"
import { BalanceStatus, FetchingIndicator, QueryState } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

interface CashFlowTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

/** A line with its accounts, which unfold on click (lines that are one account don't unfold). */
function FlowLine({ line, indent = true }: { line: CashFlowLine; indent?: boolean }) {
  const { amount } = useAccountingMoney()
  const [open, setOpen] = useState(false)
  const expandable = line.accounts.length > 1 || (line.accounts.length === 1 && line.accounts[0].name !== line.label)
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full items-baseline justify-between gap-4 py-1.5 text-left text-sm transition-colors hover:bg-muted/30",
          indent && "pl-4",
          !expandable && "cursor-default",
        )}
        onClick={() => expandable && setOpen((o) => !o)}
        aria-expanded={expandable ? open : undefined}
      >
        <span className="flex min-w-0 items-center gap-1">
          {expandable && <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />}
          <span className={cn("break-words", line.amount === 0 && "text-muted-foreground")}>{line.label}</span>
        </span>
        <span className={cn("num shrink-0 whitespace-nowrap", line.amount < 0 && "text-destructive")}>{amount(line.amount)}</span>
      </button>
      {open && (
        <ul className="mb-1 ml-9 border-l pl-3">
          {line.accounts.map((a) => (
            <li key={a.account_id} className="flex items-baseline justify-between gap-4 py-0.5 text-xs text-muted-foreground">
              <span>
                <span className="num mr-2 font-mono">{a.code}</span>
                {a.name}
              </span>
              <span className="num whitespace-nowrap">{amount(a.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Subtotal({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  const { amount } = useAccountingMoney()
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 pt-1.5 text-sm font-semibold",
        strong ? "border-y-[3px] border-double border-foreground/40 py-2 font-display text-base font-bold" : "border-t border-foreground/20",
      )}
    >
      <span>{label}</span>
      <span className={cn("num whitespace-nowrap", value < 0 && "text-destructive")}>{amount(value)}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
}

/** Cash flow statement (indirect method), with the reconciliation to the cash and bank ledger. */
export default function CashFlowTab({ dateRange, branchFilterId }: CashFlowTabProps) {
  const { money, amount } = useAccountingMoney()
  const { rangeStr, branchName } = useAccountingContext()
  const { canUpdate } = useAccountPermissions()
  const [classifyOpen, setClassifyOpen] = useState(false)
  const branchId = branchFilterId || undefined
  const cf = useCashFlowStatement({ from: rangeStr.from, to: rangeStr.to, branchId }, !!dateRange)
  const d = cf.data
  const periodLabel = formatRangeLabel(dateRange)

  const exportCsv = () => {
    if (!d) return
    const rows: (string | number)[][] = []
    const add = (section: string, label: string, value: number) => rows.push([section, label, value.toFixed(2)])
    add("Operating", "Net profit / (loss)", d.net_profit)
    for (const l of [...d.adjustments, ...d.working_capital]) add("Operating", l.label, l.amount)
    add("Operating", "Net cash from operating activities", d.net_cash_operating)
    for (const l of d.investing) add("Investing", l.label, l.amount)
    add("Investing", "Net cash from investing activities", d.net_cash_investing)
    for (const l of d.financing) add("Financing", l.label, l.amount)
    add("Financing", "Net cash from financing activities", d.net_cash_financing)
    add("", "Net change in cash", d.net_change)
    add("", "Opening cash and bank", d.opening_cash)
    add("", "Closing cash and bank", d.closing_cash)
    downloadCsv(`cash-flow-${rangeStr.from}-to-${rangeStr.to}.csv`, ["Section", "Particulars", "Amount"], rows)
  }

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard label="Operating" value={d ? money(d.net_cash_operating) : "—"} hint="Net cash from operations" icon={Waves} tone={d && d.net_cash_operating < 0 ? "danger" : "success"} loading={cf.isLoading} />
        <StatCard label="Investing" value={d ? money(d.net_cash_investing) : "—"} hint="Fixed assets, investments" icon={Building2} tone="info" loading={cf.isLoading} />
        <StatCard label="Financing" value={d ? money(d.net_cash_financing) : "—"} hint="Capital, loans, drawings" icon={Landmark} tone="warning" loading={cf.isLoading} />
        <StatCard label="Net change in cash" value={d ? money(d.net_change) : "—"} hint={periodLabel} icon={ArrowDownUp} tone={d && d.net_change < 0 ? "danger" : "primary"} loading={cf.isLoading} />
      </StatGrid>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="font-display">Cash flow statement</CardTitle>
            <CardDescription>
              Indirect method · for the period {periodLabel}
              {dateRange ? (
                <span className="block text-xs">
                  BS {formatBsLong(rangeStr.from)} – {formatBsLong(rangeStr.to)}
                </span>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FetchingIndicator active={cf.isFetching && !cf.isLoading} />
            <Button variant="outline" onClick={() => setClassifyOpen(true)}>
              <Settings2 aria-hidden />
              Classification
            </Button>
            <ReportExportMenu
              baseName="cash-flow"
              onCsv={exportCsv}
              disabled={!d}
              buildDocument={() => (d ? cashFlowDocument(d, { branchName }) : null)}
            />
            <Button variant="outline" onClick={() => void cf.refetch()} aria-label="Refresh cash flow">
              <RefreshCw aria-hidden />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={cf.isLoading}
            error={cf.error}
            onRetry={() => void cf.refetch()}
            retrying={cf.isFetching}
            errorTitle="Couldn't load the cash flow statement"
            skeleton={<SkeletonText lines={14} />}
            isEmpty={!d}
            empty={{ icon: Banknote, title: "Choose a period", description: "Pick a period above to build the statement." }}
          >
            {d && (
              <div className="mx-auto max-w-2xl space-y-5">
                <section className="space-y-1">
                  <SectionTitle>A. Operating activities</SectionTitle>
                  <ul className="divide-y divide-border/60">
                    <FlowLine line={{ key: "net_profit", label: d.net_profit < 0 ? "Net loss for the period" : "Net profit for the period", amount: d.net_profit, accounts: [] }} />
                  </ul>
                  {d.adjustments.length > 0 && (
                    <>
                      <p className="pt-1 text-xs font-medium text-muted-foreground">Adjustments for non-cash items</p>
                      <ul className="divide-y divide-border/60">
                        {d.adjustments.map((l) => (
                          <FlowLine key={l.key} line={l} />
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="pt-1 text-xs font-medium text-muted-foreground">Changes in working capital</p>
                  <ul className="divide-y divide-border/60">
                    {d.working_capital.map((l) => (
                      <FlowLine key={l.key} line={l} />
                    ))}
                  </ul>
                  <Subtotal label="Net cash from operating activities" value={d.net_cash_operating} />
                </section>

                <section className="space-y-1">
                  <SectionTitle>B. Investing activities</SectionTitle>
                  {d.investing.length === 0 ? (
                    <p className="py-1.5 pl-4 text-sm text-muted-foreground">No investing activity in this period.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {d.investing.map((l) => (
                        <FlowLine key={l.key} line={l} />
                      ))}
                    </ul>
                  )}
                  <Subtotal label="Net cash from investing activities" value={d.net_cash_investing} />
                </section>

                <section className="space-y-1">
                  <SectionTitle>C. Financing activities</SectionTitle>
                  {d.financing.length === 0 ? (
                    <p className="py-1.5 pl-4 text-sm text-muted-foreground">No financing activity in this period.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {d.financing.map((l) => (
                        <FlowLine key={l.key} line={l} />
                      ))}
                    </ul>
                  )}
                  <Subtotal label="Net cash from financing activities" value={d.net_cash_financing} />
                </section>

                <div className="space-y-1">
                  <Subtotal label="Net increase / (decrease) in cash (A + B + C)" value={d.net_change} strong />
                  <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
                    <span>Cash and bank at the beginning of the period</span>
                    <span className="num whitespace-nowrap">{amount(d.opening_cash)}</span>
                  </div>
                  <Subtotal label="Cash and bank at the end of the period" value={d.closing_cash} strong />
                </div>

                <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-sm">
                  {d.is_reconciled ? (
                    <BalanceStatus balanced difference={0} balancedLabel="Reconciled — opening + net change = closing cash and bank per the ledger" />
                  ) : (
                    <BalanceStatus balanced={false} difference={d.difference} unbalancedPrefix="Closing cash per the ledger differs from opening + net change by" />
                  )}
                  {d.cash_accounts.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {d.cash_accounts.map((a) => (
                        <li key={a.account_id} className="flex justify-between gap-4">
                          <span>
                            <span className="num mr-2 font-mono">{a.code}</span>
                            {a.name}
                          </span>
                          <span className="num whitespace-nowrap">
                            {amount(a.opening)} → {amount(a.closing)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Net profit leaves out year-end closing entries; an opening-balance voucher dated in the period counts as opening cash.
                  </p>
                </div>
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <CashFlowClassificationDialog open={classifyOpen} onOpenChange={setClassifyOpen} canEdit={canUpdate} />
    </div>
  )
}
