"use client"

import { CheckCircle2 } from "lucide-react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DueDateCell } from "@/components/shared/due-badge"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useReceivablesDue } from "@/features/accounting/hooks/use-dues"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { MoneyCell, QueryState, ScrollTable, stickyHeaderClass } from "@/features/accounting/components/accounting-ui"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

/**
 * A customer's open invoices as of a date: what is still unpaid on each sale on account (receipts settle the oldest
 * first), with its due date under the customer's payment terms and how late it is.
 */
export function CustomerOpenDues({
  customerId,
  asOf,
  branchId,
}: {
  customerId: string
  asOf: string
  branchId?: string | null
}) {
  const { money } = useAccountingMoney()
  const t = useTranslations("customers")
  const { formatBsDate, localizeDigits } = useI18n()
  const dues = useReceivablesDue(asOf, { customerId, branchId, enabled: !!customerId })
  const invoices = dues.data?.invoices ?? []

  return (
    <div className="space-y-2">
      {dues.data && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{t("dues.overdue")}</dt>
            <dd className="num font-semibold text-destructive">{money(dues.data.total_overdue)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{t("dues.dueThisWeek")}</dt>
            <dd className="num font-semibold">{money(dues.data.total_due_soon)}</dd>
          </div>
        </dl>
      )}
      <QueryState
        isLoading={dues.isLoading}
        error={dues.error}
        onRetry={() => void dues.refetch()}
        retrying={dues.isFetching}
        errorTitle={t("dues.loadError")}
        skeleton={<SkeletonTable rows={3} cols={4} />}
        isEmpty={invoices.length === 0}
        empty={{ icon: CheckCircle2, title: t("dues.nothingOpen"), description: t("dues.nothingOpenDescription") }}
      >
        <ScrollTable maxHeight="max-h-[50vh]" label={t("dues.openInvoices")}>
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead>{t("dues.date")}</TableHead>
              <TableHead>{t("dues.invoiceNo")}</TableHead>
              <TableHead>{t("dues.dueDate")}</TableHead>
              <TableHead className="text-right">{t("dues.open")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.ledger_entry_id}>
                <TableCell className="whitespace-nowrap">
                  <span className="num block">{formatBsDate(inv.entry_date) || `${t("dues.bs")} ${formatBsYmd(inv.entry_date)}`}</span>
                  <span className="num text-xs text-muted-foreground">{localizeDigits(inv.entry_date)}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {inv.document_number ?? (inv.entry_type === "OpeningBalance" ? t("dues.openingBalance") : inv.entry_type)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <DueDateCell dueDate={inv.due_date} daysOverdue={inv.days_overdue} />
                </TableCell>
                <MoneyCell value={inv.outstanding} strong />
              </TableRow>
            ))}
          </TableBody>
        </ScrollTable>
      </QueryState>
    </div>
  )
}
