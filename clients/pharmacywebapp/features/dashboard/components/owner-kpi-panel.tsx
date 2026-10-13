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
} from "@/lib/api/owner-dashboard"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

/**
 * Owner KPIs for the home page: one request (.NET owner-dashboard, cached a minute server-side) for the
 * selected branch scope. Rendered only for users with the accounting reports permission (see page.tsx).
 */
export function OwnerKpiPanel() {
  const filter = useBranchFilter()
  const t = useTranslations("dashboard")
  const tc = useTranslations("common")
  const { formatNumber, localizeDigits } = useI18n()
  const sales = (n: number | undefined) => t(n === 1 ? "owner.saleOne" : "owner.saleOther", { count: formatNumber(n ?? 0) })
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
            {t("owner.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("owner.subtitle", { scope: filter.scopeLabel })}
          </p>
        </div>
        <BranchFilterSelect filter={filter} id="owner-kpi-branch" hideLabel />
      </div>

      {query.isError && !data ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span className="text-muted-foreground">{t("owner.loadError")}</span>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {tc("actions.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <StatGrid cols={4}>
            <StatCard
              label={t("owner.salesToday")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.todaySales ?? 0} />}
              hint={sales(data?.todaySaleCount)}
              icon={Wallet}
              tone="primary"
              href="/dashboard/sales"
            />
            <StatCard
              label={t("owner.salesThisMonth")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.monthSales ?? 0} />}
              hint={t(data?.monthSaleCount === 1 ? "owner.monthSalesOne" : "owner.monthSalesOther", {
                count: formatNumber(data?.monthSaleCount ?? 0),
              })}
              icon={TrendingUp}
              tone="primary"
              href="/dashboard/sales"
            />
            <StatCard
              label={t("owner.grossMargin")}
              loading={loading}
              value={localizeDigits(formatPercent(data?.grossMarginPercent))}
              hint={
                <>
                  {t("owner.profit")} <CurrencyDisplay amount={data?.monthGrossProfit ?? 0} className="num" /> {t("owner.onNetSales")}
                </>
              }
              icon={Percent}
              tone={marginTone(data?.grossMarginPercent)}
              href="/dashboard/reports/accounting/statements"
            />
            <StatCard
              label={t("owner.stockValue")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.stockValue ?? 0} />}
              hint={t("owner.stockValueHint")}
              icon={Boxes}
              href="/dashboard/inventory"
            />
            <StatCard
              label={t("owner.receivables")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.receivables ?? 0} />}
              hint={t("owner.receivablesHint")}
              icon={HandCoins}
              tone={(data?.receivables ?? 0) > 0 ? "warning" : "default"}
              href="/dashboard/reports/accounting/receivables"
            />
            <StatCard
              label={t("owner.payables")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.payables ?? 0} />}
              hint={t("owner.payablesHint")}
              icon={Receipt}
              href="/dashboard/reports/accounting/payables"
            />
            <StatCard
              label={t("owner.cashBank")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.cashAndBankBalance ?? 0} />}
              hint={
                data && data.cashAndBankAccounts.length > 0
                  ? data.cashAndBankAccounts
                      .slice(0, 2)
                      .map((a) => a.name)
                      .join(", ") + (data.cashAndBankAccounts.length > 2 ? ` +${data.cashAndBankAccounts.length - 2}` : "")
                  : t("owner.cashBankHint")
              }
              icon={Banknote}
              tone={(data?.cashAndBankBalance ?? 0) < 0 ? "danger" : "success"}
              href="/dashboard/reports/accounting/cash"
            />
            <StatCard
              label={t("owner.vatPayable")}
              loading={loading}
              value={<CurrencyDisplay amount={data?.vatPayable ?? 0} />}
              hint={(data?.vatPayable ?? 0) < 0 ? t("owner.vatCredit") : t("owner.vatNet")}
              icon={Landmark}
              href="/dashboard/reports/accounting/vat"
            />
          </StatGrid>

          <Card className="border-border/60 shadow-none">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle className="text-base">{t("owner.topMargin")}</CardTitle>
                <CardDescription>{t("owner.topMarginDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-24 animate-pulse rounded-lg bg-muted/50" aria-hidden />
              ) : !data || data.topMedicinesByMargin.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("owner.noSales")}</p>
              ) : (
                <ol className="divide-y">
                  {data.topMedicinesByMargin.map((m, index) => (
                    <li key={m.medicineId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="num w-5 shrink-0 text-sm text-muted-foreground">{formatNumber(index + 1)}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground" title={m.name}>
                            {m.name}
                          </div>
                          <div className="num text-xs text-muted-foreground">
                            {t("owner.sold", { count: formatNumber(m.quantity) })} · <CurrencyDisplay amount={m.netRevenue} /> {t("owner.net")}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num text-sm font-semibold text-foreground">
                          <CurrencyDisplay amount={m.margin} />
                        </div>
                        <div className="num text-xs text-muted-foreground">{localizeDigits(formatPercent(m.marginPercent))}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                <Link href="/dashboard/reports">
                  {t("owner.openReports")}
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
