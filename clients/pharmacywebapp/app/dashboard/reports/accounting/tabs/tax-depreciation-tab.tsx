"use client"

import { useMemo, useState } from "react"
import { Download, Percent, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useTaxDepreciationSchedule } from "@/features/accounting/hooks/use-fixed-assets"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { fiscalYearText, recentFiscalYears, TAX_CSV_HEADERS, taxCsvRows } from "@/features/accounting/lib/fixed-assets"
import { FetchingIndicator, InlineAlert, QueryState, ScrollTable, SectionHeading, stickyFooterClass, stickyHeaderClass, totalsRowClass } from "../accounting-ui"

/**
 * Accounting › Fixed assets › Tax depreciation: the Income Tax Act 2058 Schedule 2 pool schedule for the income tax
 * return — opening base, additions by the quarter acquired (full / 2/3 / 1/3), disposal proceeds, depreciation,
 * recapture and the base carried forward. Tenant-wide (the return is per PAN). Not posted to the ledger.
 */
export default function TaxDepreciationTab() {
  const { amount, money } = useAccountingMoney()
  const years = useMemo(() => recentFiscalYears(new Date(), 6), [])
  const [fiscalYear, setFiscalYear] = useState(years[1] ?? years[0])
  const schedule = useTaxDepreciationSchedule(fiscalYear)
  const s = schedule.data

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <SectionHeading
          icon={Percent}
          title={`Tax depreciation pools · FY ${fiscalYearText(fiscalYear)}`}
          description="For the income tax return (all branches). Book depreciation stays in the ledger; the difference is a tax adjustment."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <FetchingIndicator active={schedule.isFetching && !schedule.isLoading} />
              <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
                <SelectTrigger className="w-[150px]" aria-label="Income year">
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
                disabled={!s}
                onClick={() => s && downloadCsv(`tax-depreciation-${fiscalYear}.csv`, [...TAX_CSV_HEADERS], taxCsvRows(s))}
              >
                <Download aria-hidden />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => void schedule.refetch()} aria-label="Refresh the tax schedule">
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
          errorTitle="Couldn't load the tax depreciation schedule"
        >
          {s && (
            <div className="space-y-4">
              <InlineAlert tone="info" title="Check the rates before filing">
                {s.note}
              </InlineAlert>
              <ScrollTable label="Tax depreciation pools">
                <TableHeader className={stickyHeaderClass}>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">Pool</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Opening base</TableHead>
                    <TableHead className="text-right" title="Acquired Shrawan–Poush">Additions (full)</TableHead>
                    <TableHead className="text-right" title="Acquired Magh–Chaitra">Additions (2/3)</TableHead>
                    <TableHead className="text-right" title="Acquired Baishakh–Ashadh">Additions (1/3)</TableHead>
                    <TableHead className="text-right">Disposal proceeds</TableHead>
                    <TableHead className="text-right">Depreciation base</TableHead>
                    <TableHead className="text-right">Depreciation</TableHead>
                    <TableHead className="text-right">Recapture</TableHead>
                    <TableHead className="text-right">Terminal deduction</TableHead>
                    <TableHead className="text-right">Carried forward</TableHead>
                    <TableHead className="text-right">Closing base</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.pools.map((p) => (
                    <TableRow key={p.pool}>
                      <TableCell>
                        {p.pool_name}
                        <span className="block text-xs text-muted-foreground">
                          {p.asset_count} asset{p.asset_count === 1 ? "" : "s"} at year end
                        </span>
                      </TableCell>
                      <TableCell className="num text-right">{p.pool === "E" ? "Life" : `${p.rate_percent}%`}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.opening_base)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.additions_full)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.additions_two_thirds)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.additions_one_third)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.disposal_proceeds)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.depreciation_base)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right font-medium">{amount(p.depreciation)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{p.recapture ? amount(p.recapture) : "—"}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{p.terminal_deduction ? amount(p.terminal_deduction) : "—"}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.deferred_additions)}</TableCell>
                      <TableCell className="num whitespace-nowrap text-right">{amount(p.closing_base)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className={stickyFooterClass}>
                  <TableRow className={totalsRowClass}>
                    <TableCell colSpan={8}>Total</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(s.total_depreciation)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(s.total_recapture)}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{amount(s.total_terminal_deduction)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </ScrollTable>
              <p className="text-xs text-muted-foreground">
                Deductible tax depreciation {money(s.total_depreciation)}
                {s.total_terminal_deduction > 0 ? ` plus terminal deductions ${money(s.total_terminal_deduction)}` : ""}
                {s.total_recapture > 0 ? `; recapture of ${money(s.total_recapture)} is taxable income` : ""}.
              </p>
            </div>
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}
