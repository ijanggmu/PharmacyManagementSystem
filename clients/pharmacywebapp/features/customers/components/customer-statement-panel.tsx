"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Download, Printer, ReceiptText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/shared/stat-card"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { nepalYmdOf } from "@/lib/utils/nepal-time"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { customersApi } from "@/features/customers/api-client"
import {
  buildCustomerStatementPrintHtml,
  customerStatementCsv,
  formatStatementBalance,
  statementParticulars,
} from "@/features/customers/lib/customer-statement-print"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { bsMonthLabel, bsMonthRangeOf, recentBsMonths, type BsMonth } from "@/features/accounting/lib/date-presets"
import { formatPrintAmount, printHtmlDocument } from "@/features/accounting/lib/voucher-print"

const MONTHS_SHOWN = 24

function monthKey(m: BsMonth): string {
  return `${m.year}-${m.month0}`
}

/** Whole Nepal days of a BS month, the end clamped to today so ageing is never as of a future date. */
export function statementPeriodOf(month: BsMonth, today: string): { from: string; to: string } {
  const range = bsMonthRangeOf(month)
  const from = formatLocalDateYmd(range.from)
  const end = formatLocalDateYmd(range.to)
  return { from, to: end > today ? (today < from ? from : today) : end }
}

interface CustomerStatementPanelProps {
  customerId: string
  customerAddress?: string | null
}

/** The Statement tab: a BS-month period picker, the statement lines and ageing, and print / CSV actions. */
export function CustomerStatementPanel({ customerId, customerAddress }: CustomerStatementPanelProps) {
  const t = useTranslations("customers")
  const { formatBsDate } = useI18n()
  const { toast } = useToast()
  const { profile } = usePharmacyProfile()
  const months = useMemo(() => recentBsMonths(new Date(), MONTHS_SHOWN), [])
  const [selected, setSelected] = useState(() => monthKey(months[0]))
  const month = months.find((m) => monthKey(m) === selected) ?? months[0]
  const period = statementPeriodOf(month, nepalYmdOf())

  const query = useQuery({
    queryKey: ["customers", customerId, "statement", period.from, period.to],
    queryFn: async () => {
      const result = await customersApi.getStatement(customerId, period.from, period.to)
      if (result.error || !result.data) throw new Error(result.error ?? t("statement.loadError"))
      return result.data
    },
  })
  const s = query.data

  const print = async () => {
    if (!s) return
    try {
      await printHtmlDocument(buildCustomerStatementPrintHtml({ statement: s, profile, customerAddress }))
    } catch (error) {
      toast({
        title: t("statement.printFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    }
  }

  const exportCsv = () => {
    if (!s) return
    const { headers, rows } = customerStatementCsv(s)
    downloadCsv(`statement-${s.customer_code}-${s.period_from}-to-${s.period_to}.csv`, headers, rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-[200px]" aria-label={t("statement.period")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={monthKey(m)} value={monthKey(m)}>
                {bsMonthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!s}>
            <Download aria-hidden />
            {t("statement.downloadCsv")}
          </Button>
          <Button type="button" size="sm" onClick={() => void print()} disabled={!s}>
            <Printer aria-hidden />
            {t("statement.print")}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-label={t("statement.loading")}>
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : query.isError || !s ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span>{query.error instanceof Error ? query.error.message : t("statement.loadError")}</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("detail.retry")}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("statement.openingBalance")} value={formatStatementBalance(s.opening_balance)} tone="info" />
            <StatCard label={t("statement.totalDebits")} value={<CurrencyDisplay amount={s.total_debits.toFixed(2)} />} tone="warning" />
            <StatCard label={t("statement.totalCredits")} value={<CurrencyDisplay amount={s.total_credits.toFixed(2)} />} tone="success" />
            <StatCard label={t("statement.closingBalance")} value={formatStatementBalance(s.closing_balance)} tone="primary" />
          </div>

          {s.lines.length === 0 ? (
            <EmptyState size="compact" icon={ReceiptText} title={t("statement.noLines")} description={t("statement.noLinesDescription")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t("statement.date")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("statement.docNo")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("statement.particulars")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("statement.debit")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("statement.credit")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("statement.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((line) => (
                    <tr key={line.id} className={cn("border-t", line.is_voided && "text-muted-foreground")}>
                      <td className="num whitespace-nowrap px-3 py-2">{formatBsDate(line.entry_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{line.document_number}</td>
                      <td className="px-3 py-2">
                        {statementParticulars(line)}
                        {line.is_voided && (
                          <Badge variant="muted" className="ml-2">
                            {t("statement.voided")}
                          </Badge>
                        )}
                      </td>
                      <td className={cn("num px-3 py-2 text-right", line.is_voided && "line-through")}>
                        {line.debit > 0 ? formatPrintAmount(line.debit) : ""}
                      </td>
                      <td className={cn("num px-3 py-2 text-right", line.is_voided && "line-through")}>
                        {line.credit > 0 ? formatPrintAmount(line.credit) : ""}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">{formatStatementBalance(line.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="rounded-lg border p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("statement.ageingAsOf", { date: formatBsDate(s.period_to) })}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <AgeingItem label={t("statement.current")} amount={s.ageing.current} />
              <AgeingItem label={t("statement.days31To60")} amount={s.ageing.days_31_60} />
              <AgeingItem label={t("statement.days61To90")} amount={s.ageing.days_61_90} />
              <AgeingItem label={t("statement.over90")} amount={s.ageing.over_90} />
              <AgeingItem label={t("statement.advance")} amount={s.ageing.unapplied_advance} />
              <AgeingItem label={t("statement.netBalance")} amount={s.ageing.net_balance} strong />
              {s.ageing.overdue > 0 && <AgeingItem label={t("statement.overdue")} amount={s.ageing.overdue} strong />}
            </dl>
          </section>
        </>
      )}
    </div>
  )
}

function AgeingItem({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("num", strong && "font-semibold")}>{formatPrintAmount(amount)}</dd>
    </div>
  )
}
