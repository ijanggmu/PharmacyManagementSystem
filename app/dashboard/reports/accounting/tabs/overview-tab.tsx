"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  FilePen,
  HandCoins,
  ListOrdered,
  Lock,
  LockOpen,
  Percent,
  Scale,
  TrendingDown,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { cn } from "@/lib/utils"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import {
  agingTotals,
  useApAging,
  useArAging,
  useCashMovement,
  useProfitAndLoss,
  useTrialBalance,
} from "@/features/accounting/hooks/use-accounting-reports"
import { useVoucherList, useVoucherStatusCounts } from "@/features/accounting/hooks/use-vouchers"
import { VoucherDetailSheet } from "@/features/accounting/components/voucher-detail-sheet"
import { formatBsYmd, formatRangeLabel } from "@/features/accounting/lib/date-presets"
import { isBalanced, voucherTypeLabel } from "@/features/accounting/lib/voucher-meta"
import { ErrorState } from "@/components/ui/error-state"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { VoucherSourceBadge, VoucherStatusBadge } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

const BASE = "/dashboard/reports/accounting"
const ACTIVITY_SAMPLE = 100

function HealthItem({
  ok,
  label,
  detail,
  href,
  icon: Icon,
  loading,
}: {
  ok: boolean | null
  label: string
  detail: React.ReactNode
  href?: string
  icon?: LucideIcon
  loading?: boolean
}) {
  const StatusIcon = Icon ?? (ok ? CheckCircle2 : AlertTriangle)
  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
          ok == null ? "bg-muted text-muted-foreground ring-border" : ok ? "bg-success/10 text-success ring-success/15" : "bg-warning/10 text-warning ring-warning/20"
        )}
        aria-hidden
      >
        <StatusIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{loading ? <Skeleton variant="text" className="h-3 w-32" /> : detail}</span>
      </span>
      {href && <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />}
    </>
  )
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="group flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-start gap-3 p-2">{body}</div>
      )}
    </li>
  )
}

export default function OverviewTab() {
  const { money, amount } = useAccountingMoney()
  const { dateRange, rangeStr, period, lockDate, branchName } = useAccountingContext()
  const enabled = !!dateRange
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const pl = useProfitAndLoss(period, enabled)
  const cash = useCashMovement(period, enabled)
  const ar = useArAging(rangeStr.to, period.branchId, enabled)
  const ap = useApAging(rangeStr.to, period.branchId, enabled)
  const tb = useTrialBalance(period, enabled)
  const counts = useVoucherStatusCounts(period, enabled)
  const posted = useVoucherList({ ...period, status: "posted", page: 1, pageSize: ACTIVITY_SAMPLE }, enabled)
  const recent = useVoucherList({ ...period, page: 1, pageSize: 8 }, enabled)

  const plTotals = useMemo(() => {
    const rows = pl.data?.rows ?? []
    const revenue = rows.filter((r) => r.account_type === "revenue").reduce((s, r) => s + Number(r.amount || 0), 0)
    const expense = rows.filter((r) => r.account_type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0)
    const topExpenses = rows
      .filter((r) => r.account_type === "expense" && Number(r.amount) > 0)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5)
    return { revenue, expense, net: Number(pl.data?.net_income ?? revenue - expense), topExpenses }
  }, [pl.data])

  const arTotals = useMemo(() => agingTotals(ar.data?.rows ?? []), [ar.data])
  const apTotals = useMemo(() => agingTotals(ap.data?.rows ?? []), [ap.data])
  const tbTotals = useMemo(() => {
    const rows = tb.data?.rows ?? []
    return { debit: rows.reduce((s, r) => s + r.debit_total, 0), credit: rows.reduce((s, r) => s + r.credit_total, 0) }
  }, [tb.data])

  const activity = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const v of posted.data?.data ?? []) byDay.set(v.voucher_date, (byDay.get(v.voucher_date) ?? 0) + Number(v.total_debit || 0))
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, label: date.slice(5), bs: formatBsYmd(date), value: Math.round(value * 100) / 100 }))
  }, [posted.data])
  const postedTotal = posted.data?.meta?.total ?? 0
  const sampled = postedTotal > ACTIVITY_SAMPLE

  const margin = plTotals.revenue > 0 ? (plTotals.net / plTotals.revenue) * 100 : null
  const cashTotal = cash.data ? cash.data.cash_closing + cash.data.bank_closing : null
  const tbOk = tb.data ? tb.data.debits_equal_credits && isBalanced(tbTotals.debit, tbTotals.credit) : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {formatRangeLabel(dateRange)}
        {branchName ? ` · ${branchName}` : " · all branches"}
      </p>

      <StatGrid cols={6}>
        <StatCard label="Revenue" value={pl.data ? money(plTotals.revenue) : "—"} hint="Income for the period" icon={TrendingUp} tone="success" loading={pl.isLoading} href={`${BASE}/statements`} />
        <StatCard label="Expenses" value={pl.data ? money(plTotals.expense) : "—"} hint="Incl. cost of goods sold" icon={TrendingDown} tone="warning" loading={pl.isLoading} href={`${BASE}/statements`} />
        <StatCard
          label={plTotals.net < 0 ? "Net loss" : "Net profit"}
          value={pl.data ? money(plTotals.net) : "—"}
          hint={margin != null ? `${margin.toFixed(1)}% margin` : "No revenue yet"}
          icon={Percent}
          tone={plTotals.net < 0 ? "danger" : "primary"}
          loading={pl.isLoading}
          href={`${BASE}/statements`}
        />
        <StatCard
          label="Cash & bank"
          value={cashTotal != null ? money(cashTotal) : "—"}
          hint={cash.data ? `Cash ${amount(cash.data.cash_closing)} · Bank ${amount(cash.data.bank_closing)}` : undefined}
          icon={Banknote}
          tone="info"
          loading={cash.isLoading}
          href={`${BASE}/cash`}
        />
        <StatCard
          label="Receivables"
          value={ar.data ? money(arTotals.balance) : "—"}
          hint={ar.data ? (arTotals.d90 > 0 ? `${money(arTotals.d90)} over 90 days` : "Nothing over 90 days") : undefined}
          icon={HandCoins}
          tone={arTotals.d90 > 0 ? "danger" : "default"}
          loading={ar.isLoading}
          href={`${BASE}/receivables`}
        />
        <StatCard
          label="Payables"
          value={ap.data ? money(apTotals.balance) : "—"}
          hint={ap.data ? (apTotals.d90 > 0 ? `${money(apTotals.d90)} over 90 days` : "Nothing over 90 days") : undefined}
          icon={Truck}
          tone={apTotals.d90 > 0 ? "warning" : "default"}
          loading={ap.isLoading}
          href={`${BASE}/receivables?view=payables`}
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Posting activity</CardTitle>
            <CardDescription>
              Value of posted vouchers per day (total debits).
              {sampled ? ` Based on the latest ${ACTIVITY_SAMPLE} of ${postedTotal} posted vouchers.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {posted.isLoading ? (
              <Skeleton className="h-64" />
            ) : posted.error ? (
              <ErrorState size="compact" message={apiRequestErrorMessage(posted.error)} onRetry={() => void posted.refetch()} />
            ) : activity.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
                <ListOrdered className="h-6 w-6 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">No posted vouchers in this period</p>
                <p className="max-w-xs text-xs text-muted-foreground">Sales, purchases and payments post automatically. Widen the period to see activity.</p>
              </div>
            ) : (
              <figure>
                <div className="h-64 w-full" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activity} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} minTickGap={16} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                        content={({ active, payload }) => {
                          const p = payload?.[0]?.payload as { date: string; bs: string; value: number } | undefined
                          if (!active || !p) return null
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                              <p className="num font-medium text-foreground">{p.date}</p>
                              <p className="num text-muted-foreground">BS {p.bs}</p>
                              <p className="num mt-1 font-semibold text-foreground">{money(p.value)}</p>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="sr-only">
                  Daily posted voucher value:{" "}
                  {activity.map((a) => `${a.date} ${amount(a.value)}`).join("; ")}
                </figcaption>
              </figure>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Books health</CardTitle>
            <CardDescription>What needs attention before you report this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2 space-y-1">
              <HealthItem
                ok={tbOk}
                loading={tb.isLoading}
                label={tbOk === false ? "Trial balance is out of balance" : "Trial balance"}
                detail={tb.data ? (tbOk ? `Balanced at ${money(tbTotals.debit)}` : `Differs by ${money(Math.abs(tbTotals.debit - tbTotals.credit))}`) : "—"}
                icon={Scale}
                href={`${BASE}/statements?view=trial-balance`}
              />
              <HealthItem
                ok={counts.data ? counts.data.draft === 0 : null}
                loading={counts.isLoading}
                label="Draft vouchers"
                detail={counts.data ? (counts.data.draft === 0 ? "None waiting to be posted" : `${counts.data.draft} waiting to be posted`) : "—"}
                icon={FilePen}
                href={`${BASE}/register`}
              />
              <HealthItem
                ok={ar.data ? arTotals.d90 === 0 : null}
                loading={ar.isLoading}
                label="Overdue receivables"
                detail={ar.data ? (arTotals.d90 === 0 ? "No customer over 90 days" : `${money(arTotals.d90)} over 90 days`) : "—"}
                icon={HandCoins}
                href={`${BASE}/receivables`}
              />
              <HealthItem
                ok={ap.data ? apTotals.d90 === 0 : null}
                loading={ap.isLoading}
                label="Overdue payables"
                detail={ap.data ? (apTotals.d90 === 0 ? "No supplier over 90 days" : `${money(apTotals.d90)} over 90 days`) : "—"}
                icon={Truck}
                href={`${BASE}/receivables?view=payables`}
              />
              <HealthItem
                ok={lockDate ? true : null}
                label="Posting lock"
                detail={lockDate ? `Books locked through ${lockDate}` : "No period is locked yet"}
                icon={lockDate ? Lock : LockOpen}
                href={`${BASE}/statements?view=balance-sheet`}
              />
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Recent vouchers</CardTitle>
              <CardDescription>Latest postings in the period.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${BASE}/register`}>
                View all
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.isLoading ? (
              <SkeletonText lines={6} />
            ) : recent.error ? (
              <ErrorState size="compact" message={apiRequestErrorMessage(recent.error)} onRetry={() => void recent.refetch()} />
            ) : (recent.data?.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No vouchers in this period.</p>
            ) : (
              <ul className="-mx-2 divide-y">
                {(recent.data?.data ?? []).map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">{v.voucher_no || "Draft"}</span>
                          <VoucherSourceBadge voucher={v} />
                          <VoucherStatusBadge status={v.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          <span className="num">{v.voucher_date}</span> · {voucherTypeLabel(v.voucher_type)}
                          {v.narration ? ` · ${v.narration}` : ""}
                        </span>
                      </span>
                      <span className="num shrink-0 text-sm font-semibold">{amount(Number(v.total_debit || 0))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Largest expenses</CardTitle>
            <CardDescription>Top expense accounts for the period.</CardDescription>
          </CardHeader>
          <CardContent>
            {pl.isLoading ? (
              <SkeletonText lines={5} />
            ) : pl.error ? (
              <ErrorState size="compact" message={apiRequestErrorMessage(pl.error)} onRetry={() => void pl.refetch()} />
            ) : plTotals.topExpenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No expenses posted in this period.</p>
            ) : (
              <ul className="space-y-3">
                {plTotals.topExpenses.map((r) => {
                  const pct = plTotals.expense > 0 ? (Number(r.amount) / plTotals.expense) * 100 : 0
                  return (
                    <li key={r.account_id} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="num mr-1.5 font-mono text-xs text-muted-foreground">{r.code}</span>
                          {r.name}
                        </span>
                        <span className="num shrink-0 font-medium">
                          {amount(Number(r.amount))} <span className="text-xs font-normal text-muted-foreground">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <VoucherDetailSheet voucherId={selectedId} onOpenChange={(o) => !o && setSelectedId(null)} branchName={branchName} />
    </div>
  )
}
