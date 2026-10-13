"use client"

import { useMemo, useRef, useState } from "react"
import { Calculator, CalendarCheck, History, Play, RefreshCw, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { useCanPostVouchers, useCanReverseVouchers } from "@/features/accounting/hooks/use-account-permissions"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useDepreciationPreview, useDepreciationRuns, useFixedAssetMutations } from "@/features/accounting/hooks/use-fixed-assets"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import {
  fiscalMonthLabel,
  fiscalYearText,
  lastEndedFiscalMonth,
  METHOD_LABEL,
  recentFiscalYears,
  type DepreciationRun,
} from "@/features/accounting/lib/fixed-assets"
import { FetchingIndicator, InlineAlert, QueryState, ScrollTable, SectionHeading, stickyFooterClass, stickyHeaderClass, totalsRowClass } from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

const WHOLE_YEAR = "year"

/**
 * Accounting › Fixed assets › Depreciation: pick a fiscal month (or the whole year), preview what would be posted —
 * per asset, unposted months only — then post it (one JV per branch: Dr Depreciation Expense / Cr Accumulated
 * Depreciation). Repeating a period posts nothing. Past runs can be reversed to correct an asset and run again.
 */
export default function DepreciationRunTab() {
  const { toast } = useToast()
  const { money, amount } = useAccountingMoney()
  const { branches } = useAccountingContext()
  const canPost = useCanPostVouchers()
  const canReverse = useCanReverseVouchers()
  const initial = useMemo(() => lastEndedFiscalMonth(new Date()), [])
  const years = useMemo(() => recentFiscalYears(new Date(), 6), [])
  const [fiscalYear, setFiscalYear] = useState(initial.fiscal_year)
  const [month, setMonth] = useState<number | null>(initial.month)
  const [confirming, setConfirming] = useState(false)
  const [reversing, setReversing] = useState<DepreciationRun | null>(null)
  const runKeys = useRef(createIdempotencyKeyTracker())
  const preview = useDepreciationPreview(fiscalYear, month)
  const runs = useDepreciationRuns(fiscalYear)
  const { run, reverseRun } = useFixedAssetMutations()
  const p = preview.data
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "No branch"

  const post = () => {
    const vars = { fiscal_year: fiscalYear, month }
    run.mutate(
      { ...vars, idempotency_key: runKeys.current.keyFor(JSON.stringify(vars)) },
      {
        onSuccess: (result, v) => {
          runKeys.current.reset()
          setConfirming(false)
          toast({
            title: result.vouchers > 0 ? "Depreciation posted" : "Nothing to post",
            description:
              result.vouchers > 0
                ? `${money(result.total)} for ${v.month ? fiscalMonthLabel({ fiscal_year: v.fiscal_year, month: v.month }) : fiscalYearText(v.fiscal_year)} in ${result.vouchers} voucher${result.vouchers === 1 ? "" : "s"}.`
                : "Every month of this period is already posted.",
          })
        },
        onError: (e) => {
          setConfirming(false)
          toast({ title: "Couldn't post depreciation", description: apiRequestErrorMessage(e), variant: "destructive" })
        },
      }
    )
  }

  const reverse = () => {
    if (!reversing) return
    reverseRun.mutate(reversing.id, {
      onSuccess: () => {
        toast({ title: "Depreciation run reversed", description: `${reversing.period_label} can be posted again.` })
        setReversing(null)
      },
      onError: (e) => toast({ title: "Couldn't reverse the run", description: apiRequestErrorMessage(e), variant: "destructive" }),
    })
  }

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <SectionHeading
            icon={Calculator}
            title="Run depreciation"
            description="Charges book depreciation for a month (or a whole fiscal year) — months already posted are skipped. Dated the period's last day."
            actions={<FetchingIndicator active={preview.isFetching && !preview.isLoading} />}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Fiscal year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    FY {fiscalYearText(y)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={month == null ? WHOLE_YEAR : String(month)} onValueChange={(v) => setMonth(v === WHOLE_YEAR ? null : Number(v))}>
              <SelectTrigger className="w-full sm:w-[200px]" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {fiscalMonthLabel({ fiscal_year: fiscalYear, month: m })}
                  </SelectItem>
                ))}
                <SelectItem value={WHOLE_YEAR}>Whole year (every unposted month)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void preview.refetch()} aria-label="Refresh the preview">
              <RefreshCw aria-hidden />
            </Button>
          </div>

          <QueryState
            isLoading={preview.isLoading}
            error={preview.error}
            onRetry={() => void preview.refetch()}
            retrying={preview.isFetching}
            errorTitle="Couldn't load the depreciation preview"
          >
            {p && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{p.period_label}</span> · {formatBsYmd(p.period_start)} – {formatBsYmd(p.period_end)}{" "}
                  <span className="num">
                    ({p.period_start} – {p.period_end})
                  </span>
                  {p.already_posted_months > 0 && ` · ${p.already_posted_months} asset-month${p.already_posted_months === 1 ? "" : "s"} already posted`}
                </p>
                {p.blocker && (
                  <InlineAlert tone={p.lines.length > 0 ? "warning" : "info"} title="Can't post this period">
                    {p.blocker}
                  </InlineAlert>
                )}
                {p.lines.length > 0 && (
                  <ScrollTable label="Depreciation preview">
                    <TableHeader className={stickyHeaderClass}>
                      <TableRow>
                        <TableHead>Asset</TableHead>
                        <TableHead className="hidden md:table-cell">Method</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Depreciated before</TableHead>
                        <TableHead className="text-right">Months</TableHead>
                        <TableHead className="text-right">Depreciation</TableHead>
                        <TableHead className="text-right">Book value after</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.lines.map((l) => (
                        <TableRow key={l.asset_id}>
                          <TableCell className="min-w-[10rem]">
                            {l.asset_name}
                            <span className="block text-xs text-muted-foreground">
                              {l.category}
                              {branches.length > 1 ? ` · ${branchName(l.branch_id)}` : ""}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{METHOD_LABEL[l.method]}</TableCell>
                          <TableCell className="num whitespace-nowrap text-right">{amount(l.cost)}</TableCell>
                          <TableCell className="num whitespace-nowrap text-right">{amount(l.accumulated_before)}</TableCell>
                          <TableCell className="num text-right">{l.months}</TableCell>
                          <TableCell className="num whitespace-nowrap text-right font-medium">{amount(l.amount)}</TableCell>
                          <TableCell className="num whitespace-nowrap text-right">{amount(l.nbv_after)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className={stickyFooterClass}>
                      <TableRow className={totalsRowClass}>
                        <TableCell colSpan={2}>Total ({p.lines.length} assets)</TableCell>
                        <TableCell colSpan={3} className="hidden md:table-cell" />
                        <TableCell className="num whitespace-nowrap text-right">{amount(p.total)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </ScrollTable>
                )}
                {p.branches.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    One voucher per branch: {p.branches.map((b) => `${branchName(b.branch_id)} ${money(b.amount)}`).join(" · ")}
                  </p>
                )}
                {canPost && (
                  <div className="flex justify-end">
                    <Button onClick={() => setConfirming(true)} disabled={!p.can_post || run.isPending}>
                      <Play aria-hidden />
                      Post {money(p.total)}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <SectionHeading icon={History} title={`Runs in FY ${fiscalYearText(fiscalYear)}`} description="Each run is one journal voucher per branch." />
          <QueryState
            isLoading={runs.isLoading}
            error={runs.error}
            onRetry={() => void runs.refetch()}
            retrying={runs.isFetching}
            errorTitle="Couldn't load the depreciation runs"
            isEmpty={(runs.data ?? []).length === 0}
            empty={{ icon: CalendarCheck, title: "No depreciation posted in this fiscal year yet" }}
          >
            <ScrollTable label="Depreciation runs">
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead className="hidden md:table-cell">Branch</TableHead>
                  <TableHead className="text-right">Assets</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden lg:table-cell">Posted</TableHead>
                  {canReverse && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.period_label}
                      {r.reversed_at && (
                        <Badge variant="muted" className="ml-2">
                          Reversed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.voucher_no ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{branchName(r.branch_id)}</TableCell>
                    <TableCell className="num text-right">{r.asset_count}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(r.total)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                      {formatNepalDateTime(r.posted_at)} · {r.posted_by}
                    </TableCell>
                    {canReverse && (
                      <TableCell className="text-right">
                        {!r.reversed_at && (
                          <Button variant="ghost" size="sm" onClick={() => setReversing(r)}>
                            <Undo2 aria-hidden />
                            Reverse
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
          </QueryState>
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !run.isPending && setConfirming(false)}
        onConfirm={post}
        title="Post depreciation?"
        description={p ? `${money(p.total)} for ${p.period_label} (${p.lines.length} assets): Dr Depreciation Expense / Cr Accumulated Depreciation.` : ""}
        confirmText="Post"
        variant="default"
        loading={run.isPending}
      />
      <ConfirmDialog
        isOpen={!!reversing}
        onClose={() => !reverseRun.isPending && setReversing(null)}
        onConfirm={reverse}
        title="Reverse this depreciation run?"
        description={reversing ? `${reversing.period_label}: ${money(reversing.total)} is reversed and its months can be posted again.` : ""}
        confirmText="Reverse run"
        loading={reverseRun.isPending}
      />
    </div>
  )
}
