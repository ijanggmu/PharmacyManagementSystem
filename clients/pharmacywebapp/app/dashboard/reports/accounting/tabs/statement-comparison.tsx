"use client"

import { Fragment } from "react"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { COMPARISON_MODES, type ComparisonMode, type ComparisonRow, type TrendRow } from "@/features/accounting/lib/comparatives"
import { ScrollTable, stickyHeaderClass, totalsRowClass } from "../accounting-ui"

export interface ComparisonSection {
  title: string
  rows: ComparisonRow[]
  total?: ComparisonRow
}

function VarianceCell({ row }: { row: ComparisonRow }) {
  const { amount } = useAccountingMoney()
  const { amount: v, percent } = row.variance
  return (
    <>
      <TableCell className={cn("num text-right whitespace-nowrap", v < 0 && "text-destructive", v > 0 && "text-success")}>{amount(v)}</TableCell>
      <TableCell className="num text-right whitespace-nowrap text-muted-foreground">{percent == null ? "—" : `${percent.toFixed(1)}%`}</TableCell>
    </>
  )
}

function Row({ row, strong }: { row: ComparisonRow; strong?: boolean }) {
  const { amount } = useAccountingMoney()
  return (
    <TableRow className={strong ? totalsRowClass : undefined}>
      <TableCell className="min-w-[200px]">
        {row.code && <span className="num mr-2 font-mono text-xs text-muted-foreground">{row.code}</span>}
        {row.name}
      </TableCell>
      <TableCell className={cn("num text-right whitespace-nowrap", row.current < 0 && "text-destructive")}>{amount(row.current)}</TableCell>
      <TableCell className={cn("num text-right whitespace-nowrap text-muted-foreground", row.prior < 0 && "text-destructive")}>{amount(row.prior)}</TableCell>
      <VarianceCell row={row} />
    </TableRow>
  )
}

/** Statement with current, comparison, variance and variance % columns. */
export function ComparisonTable({
  sections,
  grandTotals,
  currentLabel,
  priorLabel,
  label,
}: {
  sections: ComparisonSection[]
  grandTotals: ComparisonRow[]
  currentLabel: string
  priorLabel: string
  label: string
}) {
  return (
    <ScrollTable label={label}>
      <TableHeader className={stickyHeaderClass}>
        <TableRow>
          <TableHead>Particulars</TableHead>
          <TableHead className="text-right">{currentLabel}</TableHead>
          <TableHead className="text-right">{priorLabel}</TableHead>
          <TableHead className="text-right">Variance</TableHead>
          <TableHead className="text-right">%</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((s) => (
          <Fragment key={s.title}>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={5} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {s.title}
              </TableCell>
            </TableRow>
            {s.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="pl-6 text-sm text-muted-foreground">
                  Nothing in either period.
                </TableCell>
              </TableRow>
            ) : (
              s.rows.map((r) => <Row key={r.key} row={r} />)
            )}
            {s.total && <Row row={s.total} strong />}
          </Fragment>
        ))}
        {grandTotals.map((r) => (
          <Row key={r.key} row={r} strong />
        ))}
      </TableBody>
    </ScrollTable>
  )
}

export interface TrendSection {
  title: string
  rows: TrendRow[]
  total: TrendRow
}

/** P&L by month: one column per BS month and a total column; scrolls horizontally on small screens. */
export function TrendTable({ sections, net, monthLabels }: { sections: TrendSection[]; net: TrendRow; monthLabels: string[] }) {
  const { amount } = useAccountingMoney()
  const cells = (r: TrendRow) => (
    <>
      {r.amounts.map((v, i) => (
        <TableCell key={i} className={cn("num text-right whitespace-nowrap", v === 0 && "text-muted-foreground/60", v < 0 && "text-destructive")}>
          {amount(v)}
        </TableCell>
      ))}
      <TableCell className={cn("num text-right font-semibold whitespace-nowrap", r.total < 0 && "text-destructive")}>{amount(r.total)}</TableCell>
    </>
  )
  const nameCell = (r: TrendRow) => (
    <TableCell className="sticky left-0 z-[1] min-w-[180px] bg-card">
      {r.code && <span className="num mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>}
      {r.name}
    </TableCell>
  )
  return (
    <ScrollTable label="Monthly profit and loss">
      <TableHeader className={stickyHeaderClass}>
        <TableRow>
          <TableHead className="sticky left-0 z-[2] bg-muted">Particulars</TableHead>
          {monthLabels.map((m) => (
            <TableHead key={m} className="text-right whitespace-nowrap">
              {m}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((s) => (
          <Fragment key={s.title}>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={monthLabels.length + 2} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {s.title}
              </TableCell>
            </TableRow>
            {s.rows.map((r) => (
              <TableRow key={r.key}>
                {nameCell(r)}
                {cells(r)}
              </TableRow>
            ))}
            <TableRow className={totalsRowClass}>
              {nameCell(s.total)}
              {cells(s.total)}
            </TableRow>
          </Fragment>
        ))}
        <TableRow className={totalsRowClass}>
          {nameCell(net)}
          {cells(net)}
        </TableRow>
      </TableBody>
    </ScrollTable>
  )
}

/** "Compare with" picker; a custom choice shows its own date inputs (a range, or one date for an as-of statement). */
export function ComparisonPicker({
  id,
  mode,
  onModeChange,
  custom,
  onCustomChange,
  asOf,
}: {
  id: string
  mode: ComparisonMode
  onModeChange: (mode: ComparisonMode) => void
  custom: { from: string; to: string }
  onCustomChange: (next: { from: string; to: string }) => void
  /** As-of statements compare against one date (stored in `to`). */
  asOf?: boolean
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          Compare with
        </Label>
        <Select value={mode} onValueChange={(v) => onModeChange(v as ComparisonMode)}>
          <SelectTrigger id={id} className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARISON_MODES.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {asOf && m.id === "previous_period" ? "End of previous period" : asOf && m.id === "custom" ? "Custom date" : m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mode === "custom" && (
        <>
          {!asOf && (
            <div className="w-40 space-y-1">
              <Label htmlFor={`${id}-from`} className="text-xs text-muted-foreground">
                From
              </Label>
              <DatePicker id={`${id}-from`} value={custom.from} onChange={(from) => onCustomChange({ ...custom, from })} />
            </div>
          )}
          <div className="w-40 space-y-1">
            <Label htmlFor={`${id}-to`} className="text-xs text-muted-foreground">
              {asOf ? "As of" : "To"}
            </Label>
            <DatePicker id={`${id}-to`} value={custom.to} onChange={(to) => onCustomChange({ ...custom, to })} />
          </div>
        </>
      )}
    </div>
  )
}
