"use client"

import { useMemo, useState } from "react"
import { CalendarRange, Download, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useDepreciationSchedule } from "@/features/accounting/hooks/use-fixed-assets"
import { downloadCsv } from "@/features/accounting/lib/csv"
import {
  FISCAL_MONTH_NAMES,
  fiscalYearText,
  recentFiscalYears,
  scheduleCsvHeaders,
  scheduleCsvRows,
} from "@/features/accounting/lib/fixed-assets"
import { FetchingIndicator, QueryState, ScrollTable, SectionHeading, stickyFooterClass, stickyHeaderClass, totalsRowClass } from "../accounting-ui"

/**
 * Accounting › Fixed assets › Depreciation schedule: per asset for a fiscal year — cost and accumulated depreciation
 * brought forward, additions and disposals, the charge month by month (posted months in full colour, projected ones
 * muted) and the closing book value. CSV export.
 */
export default function DepreciationScheduleTab() {
  const { amount } = useAccountingMoney()
  const years = useMemo(() => recentFiscalYears(new Date(), 6), [])
  const [fiscalYear, setFiscalYear] = useState(years[0])
  const schedule = useDepreciationSchedule(fiscalYear)
  const s = schedule.data
  const sum = (pick: (r: NonNullable<typeof s>["rows"][number]) => number) => (s ? s.rows.reduce((t, r) => t + pick(r), 0) : 0)
  const monthTotals = Array.from({ length: 12 }, (_, i) => sum((r) => r.months[i] ?? 0))

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <SectionHeading
          icon={CalendarRange}
          title={`Depreciation schedule · FY ${fiscalYearText(fiscalYear)}`}
          description="Muted amounts are projected from each asset's terms and not posted yet — run depreciation to post them."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <FetchingIndicator active={schedule.isFetching && !schedule.isLoading} />
              <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
                <SelectTrigger className="w-[150px]" aria-label="Fiscal year">
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
              <Button
                variant="outline"
                size="sm"
                disabled={!s || s.rows.length === 0}
                onClick={() => s && downloadCsv(`depreciation-schedule-${fiscalYear}.csv`, scheduleCsvHeaders(fiscalYear), scheduleCsvRows(s))}
              >
                <Download aria-hidden />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => void schedule.refetch()} aria-label="Refresh the schedule">
                <RefreshCw aria-hidden />
              </Button>
            </div>
          }
        />
        <QueryState
          isLoading={schedule.isLoading}
          error={schedule.error}
          onRetry={() => void schedule.refetch()}
          retrying={schedule.isFetching}
          errorTitle="Couldn't load the depreciation schedule"
          isEmpty={!s || s.rows.length === 0}
          empty={{ icon: CalendarRange, title: "No assets on the books in this fiscal year" }}
        >
          {s && (
            <ScrollTable label="Depreciation schedule">
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead className="min-w-[12rem]">Asset</TableHead>
                  <TableHead className="text-right">Opening cost</TableHead>
                  <TableHead className="text-right">Additions</TableHead>
                  <TableHead className="text-right">Disposals</TableHead>
                  <TableHead className="text-right">Opening acc. dep.</TableHead>
                  {FISCAL_MONTH_NAMES.map((m) => (
                    <TableHead key={m} className="text-right">
                      {m.slice(0, 3)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">For year</TableHead>
                  <TableHead className="text-right">Closing acc. dep.</TableHead>
                  <TableHead className="text-right">Closing book value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.rows.map((r) => (
                  <TableRow key={r.asset_id}>
                    <TableCell>
                      {r.asset_name}
                      <span className="block text-xs text-muted-foreground">{[r.category, r.asset_tag].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(r.opening_cost)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{r.additions ? amount(r.additions) : "—"}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{r.disposals ? amount(r.disposals) : "—"}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(r.opening_accumulated)}</TableCell>
                    {r.months.map((m, i) => (
                      <TableCell
                        key={i}
                        className={`num whitespace-nowrap text-right ${r.posted_months[i] ? "" : "text-muted-foreground/70"}`}
                        title={r.posted_months[i] ? "Posted" : m ? "Projected — not posted yet" : undefined}
                      >
                        {m ? amount(m) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="num whitespace-nowrap text-right font-medium">{amount(r.depreciation_for_year)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(r.closing_accumulated)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right font-medium">{amount(r.closing_nbv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className={stickyFooterClass}>
                <TableRow className={totalsRowClass}>
                  <TableCell>Total</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(sum((r) => r.opening_cost))}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(sum((r) => r.additions))}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(sum((r) => r.disposals))}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(sum((r) => r.opening_accumulated))}</TableCell>
                  {monthTotals.map((t, i) => (
                    <TableCell key={i} className="num whitespace-nowrap text-right">
                      {amount(t)}
                    </TableCell>
                  ))}
                  <TableCell className="num whitespace-nowrap text-right">{amount(s.total_depreciation)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(sum((r) => r.closing_accumulated))}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{amount(s.total_closing_nbv)}</TableCell>
                </TableRow>
              </TableFooter>
            </ScrollTable>
          )}
        </QueryState>
        {s && s.rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Posted this year {amount(s.total_posted)} of {amount(s.total_depreciation)}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
