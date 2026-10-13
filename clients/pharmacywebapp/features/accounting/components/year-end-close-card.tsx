"use client"

import { useState } from "react"
import { CalendarCheck, CalendarClock, Lock, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SkeletonText } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import type { FiscalYearStatus } from "@/lib/api/accounting-api"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useFiscalYearMutations, useFiscalYears } from "@/features/accounting/hooks/use-fiscal-years"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { fiscalYearState, latestClosedYear } from "@/features/accounting/lib/fiscal-years"
import { displayUserName } from "@/features/accounting/lib/voucher-meta"
import { QueryState } from "./accounting-ui"

type PendingAction = { action: "close" | "reopen"; year: FiscalYearStatus }

const STATE_BADGE = {
  closed: { label: "Closed", variant: "success" },
  ready: { label: "Ready to close", variant: "warning" },
  waiting: { label: "Close earlier year first", variant: "muted" },
  in_progress: { label: "In progress", variant: "info" },
} as const

/**
 * Year-end close: lists fiscal years (1 Shrawan – end of Ashadh) with their close status and offers Close for the
 * oldest ended open year and Reopen for the latest closed one. Closing posts the closing vouchers, records the close
 * and moves the posting lock; `onLockChanged` receives the new lock date so the period-lock card stays in step.
 */
export function YearEndCloseCard({ onLockChanged }: { onLockChanged: (lockDate: string | null) => void }) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const years = useFiscalYears()
  const { close, reopen } = useFiscalYearMutations()
  const [pending, setPending] = useState<PendingAction | null>(null)

  const list = years.data ?? []
  const reopenable = latestClosedYear(list)
  const busy = close.isPending || reopen.isPending

  const confirm = async () => {
    if (!pending) return
    const { action, year } = pending
    try {
      if (action === "close") {
        const result = await close.mutateAsync(year.fiscal_year)
        onLockChanged(result.lockDate ?? null)
        const vouchers = result.closingVoucherIds.length
        toast({
          title: `Fiscal year ${result.label} closed`,
          description:
            vouchers === 0
              ? "There were no revenue or expense balances to transfer. The year is now locked."
              : `${vouchers} closing voucher${vouchers === 1 ? "" : "s"} posted; ${result.netProfit < 0 ? "net loss" : "net profit"} of ${money(Math.abs(result.netProfit))} moved to Retained Earnings.`,
        })
      } else {
        const result = await reopen.mutateAsync(year.fiscal_year)
        toast({
          title: `Fiscal year ${result.label} reopened`,
          description: "The closing vouchers were reversed. The posting lock is unchanged — move it to post into the year again.",
        })
      }
      setPending(null)
    } catch (e) {
      toast({ title: action === "close" ? "Close failed" : "Reopen failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    }
  }

  const year = pending?.year

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          Year-end close
        </CardTitle>
        <CardDescription>
          Closing a fiscal year (1 Shrawan – end of Ashadh) moves its profit or loss into Retained Earnings and locks
          it. Years are closed oldest first; the profit &amp; loss for a closed year still shows its real figures.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={years.isLoading}
          error={years.error}
          onRetry={() => void years.refetch()}
          retrying={years.isFetching}
          errorTitle="Couldn't load the fiscal years"
          skeleton={<SkeletonText lines={4} />}
          isEmpty={list.length === 0}
          empty={{ icon: CalendarClock, title: "No fiscal years yet", description: "Fiscal years appear once vouchers are posted." }}
        >
          <ul className="divide-y rounded-lg border">
            {list.map((y) => {
              const state = fiscalYearState(y, list)
              const badge = STATE_BADGE[state]
              const closedBy = displayUserName(y.closed_by)
              return (
                <li key={y.fiscal_year} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">FY {y.label}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="num">{y.start_date}</span> – <span className="num">{y.end_date}</span>
                      <span> · BS {formatBsLong(y.start_date)} – {formatBsLong(y.end_date)}</span>
                    </p>
                    {y.is_closed && (
                      <p className="text-xs text-muted-foreground">
                        Closed {y.closed_at ? formatNepalDateTime(y.closed_at) : ""}
                        {closedBy ? ` by ${closedBy}` : ""}
                        {y.net_profit != null ? ` · ${y.net_profit < 0 ? "net loss" : "net profit"} ${money(Math.abs(y.net_profit))}` : ""}
                        {y.closing_voucher_nos.length > 0 ? ` · ${y.closing_voucher_nos.join(", ")}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {state === "ready" && (
                      <Button size="sm" onClick={() => setPending({ action: "close", year: y })} disabled={busy}>
                        <Lock aria-hidden />
                        Close year
                      </Button>
                    )}
                    {reopenable?.fiscal_year === y.fiscal_year && (
                      <Button size="sm" variant="outline" onClick={() => setPending({ action: "reopen", year: y })} disabled={busy}>
                        <RotateCcw aria-hidden />
                        Reopen
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </QueryState>
      </CardContent>

      <ConfirmDialog
        isOpen={pending?.action === "close"}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
        title={`Close fiscal year ${year?.label ?? ""}?`}
        description={
          <div className="space-y-2">
            <p>This will:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Post a closing journal (JV) for each branch, dated <span className="num">{year?.end_date}</span> (BS{" "}
                {formatBsLong(year?.end_date)}), that brings every revenue and expense account to zero and moves the
                year&apos;s net profit or loss into Retained Earnings.
              </li>
              <li>
                Lock posting through <span className="num">{year?.end_date}</span>, so nothing more can be posted into
                this year (a later lock date is kept).
              </li>
              <li>Keep the year&apos;s profit &amp; loss unchanged; the balance sheet shows its profit under Retained Earnings.</li>
            </ul>
            <p>The year can be reopened later, which reverses the closing journals.</p>
          </div>
        }
        confirmText="Close year"
        variant="default"
        loading={busy}
      />
      <ConfirmDialog
        isOpen={pending?.action === "reopen"}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
        title={`Reopen fiscal year ${year?.label ?? ""}?`}
        description={
          <div className="space-y-2">
            <p>
              The closing journals are reversed on the year&apos;s last day, so its revenue and expense balances come
              back and Retained Earnings drops by its profit.
            </p>
            <p>The posting lock is not changed — move or clear it if you need to post into the year again.</p>
          </div>
        }
        confirmText="Reopen year"
        variant="destructive"
        loading={busy}
      />
    </Card>
  )
}
