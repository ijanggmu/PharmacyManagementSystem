"use client"

import { useEffect, useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Download, FileSpreadsheet, Landmark, Lock, LockOpen, Percent, RefreshCw, Scale, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { SkeletonText } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import type { PostingLockChange } from "@/lib/api/accounting-api"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { cn } from "@/lib/utils"
import { accountingApi } from "@/features/accounting/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useBalanceSheet, useProfitAndLoss } from "@/features/accounting/hooks/use-accounting-reports"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsLong, formatRangeLabel } from "@/features/accounting/lib/date-presets"
import { BalanceStatus, FetchingIndicator, InlineAlert, QueryState } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

/** Which statement to show; each is its own tab on the Statements page. */
export type FinancialStatement = "profit-loss" | "balance-sheet"

interface FinancialStatementsTabProps {
  statement: FinancialStatement
  dateRange: DateRange | undefined
  branchFilterId: string
  lockDate: string | null
  lockDraft: string
  setLockDraft: Dispatch<SetStateAction<string>>
  lockSaving: boolean
  setLockSaving: Dispatch<SetStateAction<boolean>>
  setLockDate: Dispatch<SetStateAction<string | null>>
}

interface StatementLine {
  key: string
  code?: string
  name: string
  amount: number
}

/** One section of a financial statement: heading, indented lines, single-ruled subtotal. */
function StatementSection({
  title,
  lines,
  totalLabel,
  total,
  emptyText,
}: {
  title: string
  lines: StatementLine[]
  totalLabel: string
  total: number
  emptyText: string
}) {
  const { amount } = useAccountingMoney()
  return (
    <section className="space-y-1">
      <h3 className="border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {lines.length === 0 ? (
        <p className="py-1.5 pl-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {lines.map((l) => (
            <li key={l.key} className="flex items-baseline justify-between gap-4 py-1.5 pl-4 text-sm transition-colors hover:bg-muted/30">
              <span className="min-w-0">
                {l.code && <span className="num mr-2 font-mono text-xs text-muted-foreground">{l.code}</span>}
                <span className="break-words">{l.name}</span>
              </span>
              <span className={cn("num shrink-0 whitespace-nowrap", l.amount < 0 && "text-destructive")}>{amount(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between gap-4 border-t border-foreground/20 pt-1.5 text-sm font-semibold">
        <span>{totalLabel}</span>
        <span className={cn("num whitespace-nowrap", total < 0 && "text-destructive")}>{amount(total)}</span>
      </div>
    </section>
  )
}

function GrandTotal({ label, value, tone }: { label: string; value: number; tone?: "positive" | "negative" }) {
  const { amount } = useAccountingMoney()
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-y-[3px] border-double border-foreground/40 py-2 font-display text-base font-bold",
        tone === "negative" && "text-destructive",
        tone === "positive" && "text-success"
      )}
    >
      <span>{label}</span>
      <span className="num whitespace-nowrap">{amount(value)}</span>
    </div>
  )
}

export default function FinancialStatementsTab({
  statement,
  dateRange,
  branchFilterId,
  lockDate,
  lockDraft,
  setLockDraft,
  lockSaving,
  setLockSaving,
  setLockDate,
}: FinancialStatementsTabProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const { rangeStr } = useAccountingContext()
  const branchId = branchFilterId || undefined

  // Who moved the lock, when, from → to (append-only on the server). Loaded with the period-close card.
  const [lockHistory, setLockHistory] = useState<PostingLockChange[] | null>(null)
  useEffect(() => {
    if (statement !== "balance-sheet") return
    let cancelled = false
    accountingApi
      .getPostingLock()
      .then((r) => {
        if (!cancelled) setLockHistory(r.history)
      })
      .catch(() => {
        if (!cancelled) setLockHistory([])
      })
    return () => {
      cancelled = true
    }
  }, [statement])

  const pl = useProfitAndLoss({ from: rangeStr.from, to: rangeStr.to, branchId }, !!dateRange)
  const bs = useBalanceSheet(rangeStr.to, branchId, !!dateRange)

  const plData = useMemo(() => {
    const rows = pl.data?.rows ?? []
    const revenue = rows.filter((r) => r.account_type === "revenue").map((r) => ({ key: r.account_id, code: r.code, name: r.name, amount: Number(r.amount || 0) }))
    const expense = rows.filter((r) => r.account_type === "expense").map((r) => ({ key: r.account_id, code: r.code, name: r.name, amount: Number(r.amount || 0) }))
    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)
    const totalExpense = expense.reduce((s, r) => s + r.amount, 0)
    return { revenue, expense, totalRevenue, totalExpense, net: Number(pl.data?.net_income ?? totalRevenue - totalExpense) }
  }, [pl.data])

  const bsData = useMemo(() => {
    const d = bs.data
    if (!d) return null
    const toLines = (rows: { account_id: string; code: string; name: string; balance: number }[]): StatementLine[] =>
      rows.map((r) => ({ key: r.account_id, code: r.code, name: r.name, amount: Number(r.balance || 0) }))
    const residual = Number(d.accounting_equation_residual || 0)
    // Current earnings (revenue − expense, not yet closed to retained earnings) stand in the equity section.
    const earnings = d.total_assets - d.total_liabilities - d.total_equity - residual
    const equityLines = toLines(d.equity)
    if (Math.abs(earnings) >= 0.005) equityLines.push({ key: "__earnings", name: "Current period earnings (unclosed P&L)", amount: earnings })
    return {
      assets: toLines(d.assets),
      liabilities: toLines(d.liabilities),
      equity: equityLines,
      totalAssets: d.total_assets,
      totalLiabilities: d.total_liabilities,
      totalEquity: d.total_equity + earnings,
      residual,
      balanced: Math.abs(residual) < 0.005,
    }
  }, [bs.data])

  const margin = plData.totalRevenue > 0 ? (plData.net / plData.totalRevenue) * 100 : null
  const periodLabel = formatRangeLabel(dateRange)
  const bsAsOf = rangeStr.to

  const exportPl = () => {
    const rows: (string | number)[][] = [
      ...plData.revenue.map((r) => ["Revenue", r.code ?? "", r.name, r.amount.toFixed(2)]),
      ["", "", "Total revenue", plData.totalRevenue.toFixed(2)],
      ...plData.expense.map((r) => ["Expenses", r.code ?? "", r.name, r.amount.toFixed(2)]),
      ["", "", "Total expenses", plData.totalExpense.toFixed(2)],
      ["", "", plData.net < 0 ? "Net loss" : "Net profit", plData.net.toFixed(2)],
    ]
    downloadCsv(`profit-and-loss-${rangeStr.from}-to-${rangeStr.to}.csv`, ["Section", "Code", "Account", "Amount"], rows)
  }

  const exportBs = () => {
    if (!bsData) return
    const rows: (string | number)[][] = [
      ...bsData.assets.map((r) => ["Assets", r.code ?? "", r.name, r.amount.toFixed(2)]),
      ["", "", "Total assets", bsData.totalAssets.toFixed(2)],
      ...bsData.liabilities.map((r) => ["Liabilities", r.code ?? "", r.name, r.amount.toFixed(2)]),
      ["", "", "Total liabilities", bsData.totalLiabilities.toFixed(2)],
      ...bsData.equity.map((r) => ["Equity", r.code ?? "", r.name, r.amount.toFixed(2)]),
      ["", "", "Total equity", bsData.totalEquity.toFixed(2)],
      ["", "", "Total liabilities and equity", (bsData.totalLiabilities + bsData.totalEquity).toFixed(2)],
    ]
    downloadCsv(`balance-sheet-as-of-${bsAsOf}.csv`, ["Section", "Code", "Account", "Balance"], rows)
  }

  const saveLock = async (next: string | null) => {
    setLockSaving(true)
    try {
      const res = await accountingApi.setPostingLock(next)
      setLockDate(res.lock_date ?? null)
      setLockDraft(res.lock_date ?? "")
      setLockHistory(res.history)
      toast({ title: next ? "Posting lock saved" : "Posting lock cleared" })
    } catch (e) {
      toast({ title: "Save failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setLockSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard label="Revenue" value={pl.data ? money(plData.totalRevenue) : "—"} hint={periodLabel} icon={TrendingUp} tone="success" loading={pl.isLoading} />
        <StatCard label="Expenses" value={pl.data ? money(plData.totalExpense) : "—"} hint="Incl. cost of goods sold" icon={TrendingDown} tone="warning" loading={pl.isLoading} />
        <StatCard
          label={plData.net < 0 ? "Net loss" : "Net profit"}
          value={pl.data ? money(plData.net) : "—"}
          hint={margin != null ? `${margin.toFixed(1)}% of revenue` : "No revenue in the period"}
          icon={Percent}
          tone={plData.net < 0 ? "danger" : "primary"}
          loading={pl.isLoading}
        />
        <StatCard
          label="Total assets"
          value={bsData ? money(bsData.totalAssets) : "—"}
          hint={bsAsOf ? `As of ${bsAsOf}` : undefined}
          icon={Landmark}
          tone="info"
          loading={bs.isLoading}
        />
      </StatGrid>

      {statement === "profit-loss" && (
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-display">Profit &amp; loss statement</CardTitle>
                <CardDescription>
                  For the period {periodLabel}
                  {dateRange ? (
                    <span className="block text-xs">
                      BS {formatBsLong(rangeStr.from)} – {formatBsLong(rangeStr.to)}
                    </span>
                  ) : null}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FetchingIndicator active={pl.isFetching && !pl.isLoading} />
                <Button variant="outline" onClick={exportPl} disabled={!pl.data}>
                  <Download aria-hidden />
                  CSV
                </Button>
                <Button variant="outline" onClick={() => void pl.refetch()} aria-label="Refresh profit and loss">
                  <RefreshCw aria-hidden />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <QueryState
                isLoading={pl.isLoading}
                error={pl.error}
                onRetry={() => void pl.refetch()}
                retrying={pl.isFetching}
                errorTitle="Couldn't load the profit & loss"
                skeleton={<SkeletonText lines={10} />}
                isEmpty={!pl.data}
                empty={{ icon: FileSpreadsheet, title: "Choose a period", description: "Pick a period above to build the statement." }}
              >
                <div className="mx-auto max-w-2xl space-y-5">
                  {pl.data?.chart_of_accounts_missing && (
                    <InlineAlert tone="destructive" title="No chart of accounts">
                      Nothing can post to the ledger yet, so every figure reads 0 — this is not the same as “no profit”.
                    </InlineAlert>
                  )}
                  {pl.data && pl.data.debits_equal_credits === false && (
                    <InlineAlert tone="warning" title="Trial balance is not balanced">
                      These figures may be unreliable until debits equal credits.
                    </InlineAlert>
                  )}
                  <StatementSection title="Revenue" lines={plData.revenue} totalLabel="Total revenue" total={plData.totalRevenue} emptyText="No revenue in this period." />
                  <StatementSection title="Expenses" lines={plData.expense} totalLabel="Total expenses" total={plData.totalExpense} emptyText="No expenses in this period." />
                  <GrandTotal label={plData.net < 0 ? "Net loss" : "Net profit"} value={plData.net} tone={plData.net < 0 ? "negative" : "positive"} />
                </div>
              </QueryState>
            </CardContent>
          </Card>
)}

      {statement === "balance-sheet" && (
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-display">Balance sheet</CardTitle>
                <CardDescription>
                  As of <span className="num">{bsAsOf || "the period end"}</span>
                  {bsAsOf ? <span className="block text-xs">BS {formatBsLong(bsAsOf)} · cumulative posted activity</span> : null}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FetchingIndicator active={bs.isFetching && !bs.isLoading} />
                <Button variant="outline" onClick={exportBs} disabled={!bsData}>
                  <Download aria-hidden />
                  CSV
                </Button>
                <Button variant="outline" onClick={() => void bs.refetch()} aria-label="Refresh balance sheet">
                  <RefreshCw aria-hidden />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <QueryState
                isLoading={bs.isLoading}
                error={bs.error}
                onRetry={() => void bs.refetch()}
                retrying={bs.isFetching}
                errorTitle="Couldn't load the balance sheet"
                skeleton={<SkeletonText lines={12} />}
                isEmpty={!bsData}
                empty={{ icon: Scale, title: "Choose a period", description: "The balance sheet is drawn up as of the end of the selected period." }}
              >
                {bsData && (
                  <div className="space-y-5">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <StatementSection title="Assets" lines={bsData.assets} totalLabel="Total assets" total={bsData.totalAssets} emptyText="No asset balances." />
                        <GrandTotal label="Total assets" value={bsData.totalAssets} />
                      </div>
                      <div className="space-y-4">
                        <StatementSection title="Liabilities" lines={bsData.liabilities} totalLabel="Total liabilities" total={bsData.totalLiabilities} emptyText="No liability balances." />
                        <StatementSection title="Equity" lines={bsData.equity} totalLabel="Total equity" total={bsData.totalEquity} emptyText="No equity balances." />
                        <GrandTotal label="Total liabilities & equity" value={bsData.totalLiabilities + bsData.totalEquity} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      {bsData.balanced ? (
                        <BalanceStatus balanced difference={0} balancedLabel="Balanced — assets = liabilities + equity" />
                      ) : (
                        <BalanceStatus balanced={false} difference={bsData.residual} unbalancedPrefix="Assets differ from liabilities + equity by" />
                      )}
                    </div>
                  </div>
                )}
              </QueryState>
            </CardContent>
          </Card>
)}

      {/* Period close sits with the balance sheet: the lock date is the "as of" date you report on. */}
      {statement === "balance-sheet" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
                Period close (posting lock)
              </CardTitle>
              <CardDescription>
                Close a period after reporting it: vouchers and automatic postings can no longer use dates on or before
                the lock date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current lock:</span>
                {lockDate ? (
                  <Badge variant="warning">
                    <Lock aria-hidden />
                    Locked through <span className="num">{lockDate}</span>
                    <span className="font-normal">(BS {formatBsLong(lockDate)})</span>
                  </Badge>
                ) : (
                  <Badge variant="muted">
                    <LockOpen aria-hidden />
                    No lock — all dates open
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-2 sm:w-80">
                  <Label htmlFor="lock-through">Lock through</Label>
                  <DatePicker id="lock-through" value={lockDraft} onChange={setLockDraft} disabled={lockSaving} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void saveLock(lockDraft.trim() ? lockDraft.trim().slice(0, 10) : null)} loading={lockSaving} disabled={!lockDraft}>
                    <Lock aria-hidden />
                    Save lock
                  </Button>
                  <Button variant="outline" onClick={() => void saveLock(null)} disabled={lockSaving || !lockDate}>
                    <LockOpen aria-hidden />
                    Clear lock
                  </Button>
                </div>
              </div>
              <PostingLockHistory history={lockHistory} />
            </CardContent>
          </Card>
)}
    </div>
  )
}

const lockLabel = (date: string | null) => (date ? date : "No lock")

/** Recent posting-lock changes, newest first: when, who, from → to. */
function PostingLockHistory({ history }: { history: PostingLockChange[] | null }) {
  return (
    <section aria-labelledby="posting-lock-history" className="space-y-2 border-t pt-4">
      <h3 id="posting-lock-history" className="text-sm font-semibold">
        Change history
      </h3>
      {history === null ? (
        <SkeletonText lines={2} />
      ) : history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="divide-y rounded-md border text-sm">
          {history.map((h, i) => (
            <li key={`${h.changed_at}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span>
                <span className="num">{lockLabel(h.from_lock_date)}</span>
                <span className="mx-1.5 text-muted-foreground" aria-label="changed to">
                  →
                </span>
                <span className="num font-medium">{lockLabel(h.to_lock_date)}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {h.changed_by} · {formatNepalDateTime(h.changed_at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
