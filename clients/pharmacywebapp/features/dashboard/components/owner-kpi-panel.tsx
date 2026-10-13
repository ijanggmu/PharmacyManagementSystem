"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { ArrowRight, Banknote, Boxes, HandCoins, Landmark, Percent, Receipt, TrendingUp, Wallet } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CurrencyDisplay } from "@/components/currency-display"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import {
  bsMonthStartUtc,
  fetchOwnerDashboard,
  formatPercent,
  marginTone,
  vatHint,
} from "@/lib/api/owner-dashboard"

/**
 * Owner KPIs for the home page: one request (.NET owner-dashboard, cached a minute server-side) for the
 * selected branch scope. Rendered only for users with the accounting reports permission (see page.tsx).
 */
export function OwnerKpiPanel() {
  const filter = useBranchFilter()
  // The BS month the rest of the app calls "this month" (computed once per mount).
  const monthStartUtc = useMemo(() => bsMonthStartUtc(new Date()), [])

  const query = useQuery({
    queryKey: ["owner-dashboard", filter.branchId ?? "", monthStartUtc],
    queryFn: () => fetchOwnerDashboard({ branchId: filter.branchId, monthStartUtc }),
    enabled: !filter.access.isLoading,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
  })

  const data = query.data
  const loading = query.isLoading || filter.access.isLoading

  return (
    <section aria-labelledby="owner-kpis-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="owner-kpis-heading" className="text-heading-3">
            Business overview
          </h2>
          <p className="text-sm text-muted-foreground">
            Sales, margin and balances · {filter.scopeLabel}. Month figures cover the current Nepali month.
          </p>
        </div>
        <BranchFilterSelect filter={filter} id="owner-kpi-branch" hideLabel />
      </div>

      {query.isError && !data ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span className="text-muted-foreground">The business overview could not be loaded.</span>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <StatGrid cols={4}>
            <StatCard
              label="Sales today"
              loading={loading}
              value={<CurrencyDisplay amount={data?.todaySales ?? 0} />}
              hint={`${data?.todaySaleCount ?? 0} ${data?.todaySaleCount === 1 ? "sale" : "sales"}`}
              icon={Wallet}
              tone="primary"
              href="/dashboard/sales"
            />
            <StatCard
              label="Sales this month"
              loading={loading}
              value={<CurrencyDisplay amount={data?.monthSales ?? 0} />}
              hint={`${data?.monthSaleCount ?? 0} ${data?.monthSaleCount === 1 ? "sale" : "sales"}, VAT included`}
              icon={TrendingUp}
              tone="primary"
              href="/dashboard/sales"
            />
            <StatCard
              label="Gross margin (month)"
              loading={loading}
              value={formatPercent(data?.grossMarginPercent)}
              hint={
                <>
                  Profit <CurrencyDisplay amount={data?.monthGrossProfit ?? 0} className="num" /> on net sales
                </>
              }
              icon={Percent}
              tone={marginTone(data?.grossMarginPercent)}
              href="/dashboard/reports/accounting/statements"
            />
            <StatCard
              label="Stock value"
              loading={loading}
              value={<CurrencyDisplay amount={data?.stockValue ?? 0} />}
              hint="On hand, at cost"
              icon={Boxes}
              href="/dashboard/inventory"
            />
            <StatCard
              label="Receivables"
              loading={loading}
              value={<CurrencyDisplay amount={data?.receivables ?? 0} />}
              hint="Owed by customers"
              icon={HandCoins}
              tone={(data?.receivables ?? 0) > 0 ? "warning" : "default"}
              href="/dashboard/reports/accounting/receivables"
            />
            <StatCard
              label="Payables"
              loading={loading}
              value={<CurrencyDisplay amount={data?.payables ?? 0} />}
              hint="Owed to suppliers"
              icon={Receipt}
              href="/dashboard/reports/accounting/payables"
            />
            <StatCard
              label="Cash & bank"
              loading={loading}
              value={<CurrencyDisplay amount={data?.cashAndBankBalance ?? 0} />}
              hint={
                data && data.cashAndBankAccounts.length > 0
                  ? data.cashAndBankAccounts
                      .slice(0, 2)
                      .map((a) => a.name)
                      .join(", ") + (data.cashAndBankAccounts.length > 2 ? ` +${data.cashAndBankAccounts.length - 2}` : "")
                  : "Cash in hand and bank accounts"
              }
              icon={Banknote}
              tone={(data?.cashAndBankBalance ?? 0) < 0 ? "danger" : "success"}
              href="/dashboard/reports/accounting/cash"
            />
            <StatCard
              label="VAT payable"
              loading={loading}
              value={<CurrencyDisplay amount={data?.vatPayable ?? 0} />}
              hint={vatHint(data?.vatPayable ?? 0)}
              icon={Landmark}
              href="/dashboard/reports/accounting/vat"
            />
          </StatGrid>

          <Card className="border-border/60 shadow-none">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Top medicines by margin</CardTitle>
                <CardDescription>This month, net of VAT, at the batch cost they were sold from</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-24 animate-pulse rounded-lg bg-muted/50" aria-hidden />
              ) : !data || data.topMedicinesByMargin.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed sales this month yet.</p>
              ) : (
                <ol className="divide-y">
                  {data.topMedicinesByMargin.map((m, index) => (
                    <li key={m.medicineId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="num w-5 shrink-0 text-sm text-muted-foreground">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground" title={m.name}>
                            {m.name}
                          </div>
                          <div className="num text-xs text-muted-foreground">
                            {m.quantity} sold · <CurrencyDisplay amount={m.netRevenue} /> net
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num text-sm font-semibold text-foreground">
                          <CurrencyDisplay amount={m.margin} />
                        </div>
                        <div className="num text-xs text-muted-foreground">{formatPercent(m.marginPercent)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                <Link href="/dashboard/reports">
                  Open reports
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
