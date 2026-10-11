"use client"

import { useMemo } from "react"
import { CheckCircle2, Lock, PencilLine, RotateCcw } from "lucide-react"
import { formatBsLabel } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { InlineAlert } from "@/features/accounting/components/accounting-ui"
import type { OpeningBalanceState } from "@/features/accounting/api-client-opening-balances"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { OPENING_SECTIONS, formatNepaliAmount, sectionFor } from "@/features/accounting/lib/opening-balances"

function formatWhen(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** The active opening balances, grouped by section, with Edit / Reset for users who may manage them. */
export function OpeningBalanceSummary({
  state,
  canManage,
  onEdit,
  onReset,
  onOpenVoucher,
}: {
  state: OpeningBalanceState
  canManage: boolean
  onEdit: () => void
  onReset: () => void
  onOpenVoucher: (voucherId: string) => void
}) {
  const { symbol } = useAccountingMoney()
  const locked = !!(state.postingLockDate && state.openingDate && state.openingDate <= state.postingLockDate)
  const bs = state.openingDate ? formatBsLabel(state.openingDate) : null

  const sections = useMemo(
    () =>
      OPENING_SECTIONS.map((section) => ({
        section,
        lines: state.lines
          .filter((l) => sectionFor({ code: l.accountCode, account_type: l.accountType }) === section.id)
          .sort((a, b) => a.accountCode.localeCompare(b.accountCode, "en", { numeric: true })),
      })).filter((s) => s.lines.length > 0),
    [state.lines],
  )

  const equityAdj = state.equityAdjustmentCredit || state.equityAdjustmentDebit
  const cell = "num whitespace-nowrap px-3 py-2 text-right tabular-nums"

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-display text-base font-semibold">
                Live since <span className="num">{state.openingDate}</span>
                {bs && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({bs} BS)</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {state.voucherId ? (
                  <>
                    Posted as{" "}
                    <button
                      type="button"
                      onClick={() => onOpenVoucher(state.voucherId!)}
                      className="num font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {state.voucherNo ?? "opening voucher"}
                    </button>
                  </>
                ) : null}
                {state.lastChangedBy && (
                  <>
                    {" · "}last changed by {state.lastChangedBy}
                    {state.lastChangedAtUtc && <> on {formatWhen(state.lastChangedAtUtc)}</>}
                  </>
                )}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
              <Button type="button" variant="outline" onClick={onEdit} disabled={locked}>
                <PencilLine aria-hidden />
                Edit
              </Button>
              <Button type="button" variant="outline" onClick={onReset} disabled={locked} className="text-destructive hover:text-destructive">
                <RotateCcw aria-hidden />
                Reset
              </Button>
            </div>
          )}
        </div>

        {locked && canManage && (
          <InlineAlert tone="info" title="Locked period">
            <span className="inline-flex items-start gap-1">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              The books are locked up to <span className="num">{state.postingLockDate}</span>, which covers the go-live date. Move the
              posting lock date back to edit or reset these balances.
            </span>
          </InlineAlert>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="sr-only">Opening balances by account</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Account</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Debit ({symbol})</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Credit ({symbol})</th>
              </tr>
            </thead>
            {sections.map(({ section, lines }) => (
              <tbody key={section.id} className="divide-y border-t">
                <tr className="bg-muted/20">
                  <th scope="rowgroup" colSpan={3} className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </th>
                </tr>
                {lines.map((l) => (
                  <tr key={l.accountId}>
                    <td className="px-3 py-2">
                      <span className="num mr-2 text-xs text-muted-foreground">{l.accountCode}</span>
                      {l.accountName}
                    </td>
                    <td className={cell}>{l.debitAmount ? formatNepaliAmount(l.debitAmount) : ""}</td>
                    <td className={cell}>{l.creditAmount ? formatNepaliAmount(l.creditAmount) : ""}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            {equityAdj > 0 && (
              <tbody className="border-t">
                <tr className="bg-info/5">
                  <td className="px-3 py-2">
                    <span className="num mr-2 text-xs text-muted-foreground">{state.equityAccountCode}</span>
                    {state.equityAccountName ?? "Owner's Equity"}
                    <span className="ml-2 text-xs text-muted-foreground">balancing difference</span>
                  </td>
                  <td className={cell}>{state.equityAdjustmentDebit ? formatNepaliAmount(state.equityAdjustmentDebit) : ""}</td>
                  <td className={cell}>{state.equityAdjustmentCredit ? formatNepaliAmount(state.equityAdjustmentCredit) : ""}</td>
                </tr>
              </tbody>
            )}
            <tfoot className="border-t-2 border-foreground/15 bg-muted/60 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className={cell}>{formatNepaliAmount(state.totalDebit + state.equityAdjustmentDebit)}</td>
                <td className={cell}>{formatNepaliAmount(state.totalCredit + state.equityAdjustmentCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
