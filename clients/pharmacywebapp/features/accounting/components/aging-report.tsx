"use client"

import { useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { AlertTriangle, CalendarClock, Clock, Download, RefreshCw, Search, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { cn } from "@/lib/utils"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { agingTotals } from "@/features/accounting/hooks/use-accounting-reports"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import {
  FetchingIndicator,
  MoneyCell,
  QueryState,
  ScrollTable,
  SectionHeading,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "./accounting-ui"

export interface AgingRow {
  id: string
  name: string
  balance: number
  current: number
  days_31_60: number
  days_61_90: number
  days_90_plus: number
}

interface AgingReportProps {
  kind: "receivable" | "payable"
  rows: AgingRow[] | undefined
  asOf: string
  isLoading: boolean
  isFetching: boolean
  error: unknown
  onRetry: () => void
  selectedId?: string
  onSelect?: (row: AgingRow) => void
  /** Extra header actions (e.g. export statement). */
  actions?: React.ReactNode
  emptyIcon?: LucideIcon
  /** Quick per-row action (e.g. "Receive" / "Pay"), shown in a trailing column. */
  rowAction?: {
    label: string
    icon?: LucideIcon
    onClick: (row: AgingRow) => void
    /** Rows the action does not apply to (e.g. walk-in, nothing outstanding). */
    hidden?: (row: AgingRow) => boolean
  }
}

type BucketFilter = "all" | "current" | "d31" | "d61" | "d90" | "advance"
type SortKey = "balance_desc" | "balance_asc" | "oldest" | "name"

const PAGE_SIZES = [10, 20, 50, 100] as const

const BUCKET_FILTERS: { value: BucketFilter; label: string }[] = [
  { value: "all", label: "All balances" },
  { value: "current", label: "Has 0–30 days" },
  { value: "d31", label: "Has 31–60 days" },
  { value: "d61", label: "Has 61–90 days" },
  { value: "d90", label: "Has 90+ days" },
  { value: "advance", label: "Advances (credit balance)" },
]

const SORTS: { value: SortKey; label: string }[] = [
  { value: "balance_desc", label: "Highest balance" },
  { value: "balance_asc", label: "Lowest balance" },
  { value: "oldest", label: "Most overdue first" },
  { value: "name", label: "Name (A–Z)" },
]

/** Weighted age: more money in older buckets sorts first under "Most overdue first". */
function overdueWeight(r: AgingRow): number {
  return r.days_90_plus * 1e6 + r.days_61_90 * 1e3 + r.days_31_60
}

const BUCKETS = [
  { key: "current", label: "0–30 days", className: "bg-chart-1" },
  { key: "days_31_60", label: "31–60 days", className: "bg-chart-3" },
  { key: "days_61_90", label: "61–90 days", className: "bg-chart-4" },
  { key: "days_90_plus", label: "90+ days", className: "bg-destructive" },
] as const

/**
 * Aging summary (bucket KPI cards + distribution bar) and a searchable party table.
 * Shared by receivables (customers) and payables (suppliers).
 */
export function AgingReport({
  kind,
  rows,
  asOf,
  isLoading,
  isFetching,
  error,
  onRetry,
  selectedId,
  onSelect,
  actions,
  emptyIcon = Wallet,
  rowAction,
}: AgingReportProps) {
  const { money } = useAccountingMoney()
  const [search, setSearch] = useState("")
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [bucket, setBucket] = useState<BucketFilter>("all")
  const [sort, setSort] = useState<SortKey>("balance_desc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const party = kind === "receivable" ? "Customer" : "Supplier"
  const all = useMemo(() => rows ?? [], [rows])
  const totals = useMemo(() => agingTotals(all), [all])

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return all
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .filter((r) => !overdueOnly || r.days_31_60 + r.days_61_90 + r.days_90_plus > 0.005)
      .filter((r) => {
        switch (bucket) {
          case "current":
            return r.current > 0.005
          case "d31":
            return r.days_31_60 > 0.005
          case "d61":
            return r.days_61_90 > 0.005
          case "d90":
            return r.days_90_plus > 0.005
          case "advance":
            return r.balance < -0.005
          default:
            return true
        }
      })
      .sort((a, b) => {
        if (sort === "balance_asc") return a.balance - b.balance
        if (sort === "name") return a.name.localeCompare(b.name)
        if (sort === "oldest") return overdueWeight(b) - overdueWeight(a) || b.balance - a.balance
        return b.balance - a.balance
      })
  }, [all, search, overdueOnly, bucket, sort])
  const shownTotals = useMemo(() => agingTotals(shown), [shown])

  // Any filter change goes back to the first page.
  useEffect(() => setPage(1), [search, overdueOnly, bucket, sort, pageSize, rows])
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const pageRows = shown.slice(startIndex, startIndex + pageSize)
  const filtersActive = !!search.trim() || overdueOnly || bucket !== "all"
  const clearFilters = () => {
    setSearch("")
    setOverdueOnly(false)
    setBucket("all")
  }

  const overdue = totals.d31 + totals.d61 + totals.d90
  const bucketValues = [totals.current, totals.d31, totals.d61, totals.d90]
  const positiveTotal = bucketValues.reduce((s, v) => s + Math.max(0, v), 0)

  const exportCsv = () => {
    const data = shown.map((r) => [r.name, r.balance.toFixed(2), r.current.toFixed(2), r.days_31_60.toFixed(2), r.days_61_90.toFixed(2), r.days_90_plus.toFixed(2)])
    data.push(["TOTAL", shownTotals.balance.toFixed(2), shownTotals.current.toFixed(2), shownTotals.d31.toFixed(2), shownTotals.d61.toFixed(2), shownTotals.d90.toFixed(2)])
    downloadCsv(`${kind === "receivable" ? "ar" : "ap"}-aging-as-of-${asOf}.csv`, [party, "Balance", "0-30", "31-60", "61-90", "90+"], data)
  }

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard
          label={kind === "receivable" ? "Total receivable" : "Total payable"}
          value={rows ? money(totals.balance) : "—"}
          hint={rows ? `${all.length} ${party.toLowerCase()}${all.length === 1 ? "" : "s"} with balances` : undefined}
          icon={Wallet}
          tone="primary"
          loading={isLoading}
        />
        <StatCard
          label="Current (0–30 days)"
          value={rows ? money(totals.current) : "—"}
          hint={kind === "receivable" ? "Within normal credit terms" : "Not yet due for attention"}
          icon={Clock}
          tone="success"
          loading={isLoading}
        />
        <StatCard
          label="31–90 days"
          value={rows ? money(totals.d31 + totals.d61) : "—"}
          hint={kind === "receivable" ? "Follow up with these customers" : "Plan payment soon"}
          icon={CalendarClock}
          tone="warning"
          loading={isLoading}
          onClick={rows && overdue > 0 ? () => setOverdueOnly((v) => !v) : undefined}
          active={overdueOnly}
        />
        <StatCard
          label="Over 90 days"
          value={rows ? money(totals.d90) : "—"}
          hint={totals.d90 > 0 ? (kind === "receivable" ? "Overdue — chase or provide for" : "Overdue — settle first") : "Nothing overdue"}
          icon={AlertTriangle}
          tone={totals.d90 > 0 ? "danger" : "default"}
          loading={isLoading}
        />
      </StatGrid>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <SectionHeading
          title={`${kind === "receivable" ? "AR" : "AP"} aging`}
          description={
            <>
              Open balances by age as of <span className="num">{asOf || "—"}</span>
              {asOf ? <> (BS {formatBsLong(asOf)})</> : null}. {onSelect ? `Select a ${party.toLowerCase()} to see their ledger.` : ""}
            </>
          }
          actions={
            <>
              <FetchingIndicator active={isFetching && !isLoading} />
              {actions}
              <Button variant="outline" onClick={exportCsv} disabled={shown.length === 0}>
                <Download aria-hidden />
                CSV
              </Button>
              <Button variant="outline" onClick={onRetry} aria-label="Refresh aging">
                <RefreshCw aria-hidden />
              </Button>
            </>
          }
        />

        {rows && positiveTotal > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Share of balance by age bucket">
              {BUCKETS.map((b, i) => {
                const pct = (Math.max(0, bucketValues[i]) / positiveTotal) * 100
                return pct > 0 ? <div key={b.key} className={cn("h-full", b.className)} style={{ width: `${pct}%` }} /> : null
              })}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {BUCKETS.map((b, i) => (
                <li key={b.key} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", b.className)} aria-hidden />
                  {b.label}
                  <span className="num font-medium text-foreground">
                    {positiveTotal > 0 ? `${((Math.max(0, bucketValues[i]) / positiveTotal) * 100).toFixed(0)}%` : "0%"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor={`${kind}-aging-search`} className="text-xs font-medium text-muted-foreground">
              Find {party.toLowerCase()}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={`${kind}-aging-search`}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor={`${kind}-aging-bucket`} className="text-xs font-medium text-muted-foreground">
              Age
            </Label>
            <Select value={bucket} onValueChange={(v) => setBucket(v as BucketFilter)}>
              <SelectTrigger id={`${kind}-aging-bucket`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor={`${kind}-aging-sort`} className="text-xs font-medium text-muted-foreground">
              Sort by
            </Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger id={`${kind}-aging-sort`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Overdue only (31+ days)
          </label>
          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              <X aria-hidden />
              Clear
            </Button>
          )}
        </div>

        <div className="mt-3">
          <QueryState
            isLoading={isLoading}
            error={error}
            onRetry={onRetry}
            retrying={isFetching}
            errorTitle={`Couldn't load the ${kind === "receivable" ? "AR" : "AP"} aging`}
            skeleton={<SkeletonTable rows={6} cols={6} />}
            isEmpty={shown.length === 0}
            empty={
              all.length === 0
                ? {
                    icon: emptyIcon,
                    title: kind === "receivable" ? "Nothing receivable" : "Nothing payable",
                    description:
                      kind === "receivable"
                        ? "No customer has an open credit balance as of this date."
                        : "You owe no supplier anything as of this date.",
                  }
                : {
                    icon: Search,
                    title: `No ${party.toLowerCase()} matches`,
                    description: "Clear the search or the overdue filter.",
                    action: { label: "Clear filters", onClick: clearFilters, icon: X },
                  }
            }
          >
            <ScrollTable maxHeight="max-h-[50vh]" label={`${party} aging`}>
              <TableHeader className={stickyHeaderClass}>
                <TableRow>
                  <TableHead className="min-w-[180px]">{party}</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  {rowAction && (
                    <TableHead className="w-24">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => {
                  const selected = selectedId === r.id
                  return (
                    <TableRow
                      key={r.id}
                      data-state={selected ? "selected" : undefined}
                      className={cn(onSelect && "cursor-pointer")}
                      onClick={onSelect ? () => onSelect(r) : undefined}
                    >
                      <TableCell className="max-w-[260px] font-medium">
                        {onSelect ? (
                          <button
                            type="button"
                            className="max-w-full truncate rounded-sm text-left underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSelect(r)
                            }}
                            aria-pressed={selected}
                            title={r.name}
                          >
                            {r.name}
                          </button>
                        ) : (
                          <span className="block truncate" title={r.name}>
                            {r.name}
                          </span>
                        )}
                      </TableCell>
                      <MoneyCell value={r.balance} strong signed />
                      <MoneyCell value={r.current} blankZero />
                      <MoneyCell value={r.days_31_60} blankZero className={cn(r.days_31_60 > 0 && "text-warning")} />
                      <MoneyCell value={r.days_61_90} blankZero className={cn(r.days_61_90 > 0 && "text-warning")} />
                      <MoneyCell value={r.days_90_plus} blankZero className={cn(r.days_90_plus > 0 && "font-semibold text-destructive")} />
                      {rowAction && (
                        <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {!rowAction.hidden?.(r) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => rowAction.onClick(r)}
                              aria-label={`${rowAction.label}: ${r.name}`}
                            >
                              {rowAction.icon && <rowAction.icon aria-hidden />}
                              {rowAction.label}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter className={stickyFooterClass}>
                <TableRow className={totalsRowClass}>
                  <TableCell>
                    Totals{shown.length !== all.length ? ` (${shown.length} of ${all.length})` : ""}
                  </TableCell>
                  <MoneyCell value={shownTotals.balance} strong />
                  <MoneyCell value={shownTotals.current} />
                  <MoneyCell value={shownTotals.d31} />
                  <MoneyCell value={shownTotals.d61} />
                  <MoneyCell value={shownTotals.d90} />
                  {rowAction && <TableCell />}
                </TableRow>
              </TableFooter>
            </ScrollTable>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Label htmlFor={`${kind}-aging-page-size`} className="text-sm font-normal">
                  Rows per page
                </Label>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger id={`${kind}-aging-page-size`} className="h-9 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={shown.length}
                itemsPerPage={pageSize}
                startIndex={startIndex}
                onPageChange={setPage}
              />
            </div>
          </QueryState>
        </div>
      </div>
    </div>
  )
}
