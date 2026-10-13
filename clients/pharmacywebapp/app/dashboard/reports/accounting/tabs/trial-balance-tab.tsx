"use client"

import { Fragment, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, Flag, Layers, ListTree, Printer, RefreshCw, Scale, Search, Sigma, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { cn } from "@/lib/utils"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { usePeriodTrialBalance } from "@/features/accounting/hooks/use-accounting-reports"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { buildTaxReportPrintHtml } from "@/features/accounting/lib/ird-print"
import {
  buildTrialBalanceView,
  trialBalanceCsv,
  type TrialBalanceColumns,
  type TrialBalanceViewRow,
} from "@/features/accounting/lib/period-trial-balance"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { ReportExportMenu } from "@/features/accounting/components/report-export-menu"
import { trialBalanceDocument } from "@/features/accounting/lib/statement-documents"
import {
  BalanceStatus,
  FetchingIndicator,
  InlineAlert,
  MoneyCell,
  QueryState,
  ScrollTable,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

interface DateRange {
  from: Date
  to: Date
}

interface TrialBalanceTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
  onOpenLedgerAccount: (accountCode: string) => void
}

/** The six figure columns, in table order. */
const COLUMN_KEYS: (keyof TrialBalanceColumns)[] = ["openingDr", "openingCr", "periodDr", "periodCr", "closingDr", "closingCr"]
/** Divider before each column pair so Opening / Period / Closing read as three blocks. */
const pairStart = (i: number) => i % 2 === 0 && "border-l border-border/60"

export default function TrialBalanceTab({ dateRange, branchFilterId, onOpenLedgerAccount }: TrialBalanceTabProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const { profile } = usePharmacyProfile()
  const { rangeStr, branchName } = useAccountingContext()
  const [grouped, setGrouped] = useState(true)
  const [hideZero, setHideZero] = useState(true)
  const [openingVoucherAsOpening, setOpeningVoucherAsOpening] = useState(true)
  const [search, setSearch] = useState("")
  const [printing, setPrinting] = useState(false)

  const tb = usePeriodTrialBalance({ from: rangeStr.from, to: rangeStr.to, branchId: branchFilterId || undefined }, !!dateRange)
  const accounts = useMemo(() => tb.data?.accounts ?? [], [tb.data])
  const openingVouchers = tb.data?.openingVouchersInPeriod ?? []

  const view = useMemo(
    () => buildTrialBalanceView(accounts, { openingVoucherAsOpening, hideZero, search }),
    [accounts, openingVoucherAsOpening, hideZero, search]
  )
  const { totals, balance } = view
  const filtered = hideZero || search.trim() !== ""
  const shownTotals = useMemo(() => {
    if (!filtered) return totals
    return view.groups.reduce<TrialBalanceColumns>(
      (acc, g) => {
        for (const k of COLUMN_KEYS) acc[k] = Math.round((acc[k] + g.totals[k]) * 100) / 100
        return acc
      },
      { openingDr: 0, openingCr: 0, periodDr: 0, periodCr: 0, closingDr: 0, closingCr: 0 }
    )
  }, [filtered, totals, view.groups])
  const hiddenCount = accounts.length - view.rows.length

  const periodLabel = `${rangeStr.from} to ${rangeStr.to} (BS ${formatBsYmd(rangeStr.from)} – ${formatBsYmd(rangeStr.to)})`
  const scopeLabel = branchName ?? "All branches"
  const openingNote = view.hasOpeningVoucherInPeriod
    ? openingVoucherAsOpening
      ? "Opening-balance voucher in this period is shown as opening."
      : "Opening-balance voucher in this period is included in the period movement."
    : null

  const exportCsv = () => {
    if (!view.rows.length) {
      toast({ title: "No trial balance rows to export", variant: "destructive" })
      return
    }
    const { headers, rows } = trialBalanceCsv(view, grouped)
    downloadCsv(`trial-balance-${rangeStr.from}-to-${rangeStr.to}.csv`, headers, rows)
  }

  const print = async () => {
    if (!view.rows.length) {
      toast({ title: "Nothing to print", variant: "destructive" })
      return
    }
    setPrinting(true)
    try {
      const { headers, rows } = trialBalanceCsv(view, grouped)
      const totalsRow = rows[rows.length - 1]
      await printHtmlDocument(
        buildTaxReportPrintHtml({
          title: "Trial balance",
          organisation: profile.panVat ? `${profile.name} · PAN/VAT ${profile.panVat}` : profile.name,
          subtitle: [periodLabel, scopeLabel, ...(openingNote ? [openingNote] : [])],
          headers,
          numeric: headers.map((_, i) => i >= 3),
          rows: rows.slice(0, -1),
          totals: totalsRow,
          footnote: balance.all
            ? "Opening, period and closing totals balance (debits = credits)."
            : `OUT OF BALANCE — opening ${balance.openingDifference.toFixed(2)}, movement ${balance.movementDifference.toFixed(2)}, closing ${balance.closingDifference.toFixed(2)} (Dr − Cr).`,
        })
      )
    } catch (e) {
      toast({ title: "Print failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setPrinting(false)
    }
  }

  const renderRow = (r: TrialBalanceViewRow, indent: boolean) => (
    <TableRow key={r.accountId} className="group cursor-pointer" onClick={() => onOpenLedgerAccount(r.code)}>
      <TableCell className={cn("sticky left-0 z-[1] bg-background group-hover:bg-muted/50", indent && "pl-6")}>
        <button
          type="button"
          className="rounded-sm font-mono text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => {
            e.stopPropagation()
            onOpenLedgerAccount(r.code)
          }}
          aria-label={`Open ledger for ${r.code} ${r.name}`}
        >
          {r.code}
        </button>
      </TableCell>
      <TableCell className="max-w-[280px]">
        <span className="inline-flex max-w-full items-center gap-1.5">
          <span className="truncate" title={r.name}>
            {r.name}
          </span>
          {!openingVoucherAsOpening && Math.abs(r.openingVoucherNet) >= 0.005 && (
            <Flag className="h-3.5 w-3.5 shrink-0 text-info" aria-label="Movement includes the opening-balance voucher" />
          )}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </span>
      </TableCell>
      {COLUMN_KEYS.map((k, i) => (
        <MoneyCell key={k} value={r[k]} blankZero className={cn(pairStart(i))} />
      ))}
    </TableRow>
  )

  const totalCells = (c: TrialBalanceColumns, strong: boolean, extra?: string) =>
    COLUMN_KEYS.map((k, i) => <MoneyCell key={k} value={c[k]} strong={strong} className={cn(pairStart(i), extra)} />)

  const pairStatus = (ok: boolean, label: string) => (
    <span className={cn("inline-flex items-center gap-1", ok ? "text-success" : "text-destructive")}>
      {ok ? <Scale className="h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
      {label} {ok ? "balanced" : "off"}
    </span>
  )

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard
          label="Opening balances"
          value={tb.data ? money(totals.openingDr) : "—"}
          hint={tb.data ? (balance.opening ? "Dr = Cr at period start" : `Dr − Cr = ${money(balance.openingDifference)}`) : undefined}
          icon={Layers}
          tone={tb.data && !balance.opening ? "danger" : "info"}
          loading={tb.isLoading}
        />
        <StatCard
          label="Period movement"
          value={tb.data ? money(totals.periodDr) : "—"}
          hint={tb.data ? (balance.movement ? "Debits = credits posted in the period" : `Dr − Cr = ${money(balance.movementDifference)}`) : undefined}
          icon={Sigma}
          tone={tb.data && !balance.movement ? "danger" : "info"}
          loading={tb.isLoading}
        />
        <StatCard
          label="Closing balances"
          value={tb.data ? money(totals.closingDr) : "—"}
          hint={tb.data ? (balance.closing ? "Dr = Cr at period end" : `Dr − Cr = ${money(balance.closingDifference)}`) : undefined}
          icon={Layers}
          tone={tb.data && !balance.closing ? "danger" : "info"}
          loading={tb.isLoading}
        />
        <StatCard
          label="Status"
          value={tb.data ? (balance.all ? "Balanced" : "Out of balance") : "—"}
          hint={tb.data ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} with postings` : undefined}
          icon={balance.all ? Scale : AlertTriangle}
          tone={!tb.data ? "default" : balance.all ? "success" : "danger"}
          loading={tb.isLoading}
        />
      </StatGrid>

      {tb.data && !balance.all && (
        <InlineAlert tone="destructive" title="Trial balance is out of balance">
          Differences (Dr − Cr): opening {money(balance.openingDifference)}, movement {money(balance.movementDifference)}, closing{" "}
          {money(balance.closingDifference)}. Review recent vouchers in the register.
        </InlineAlert>
      )}

      {tb.data && view.hasOpeningVoucherInPeriod && (
        <InlineAlert tone="info" title="Opening-balance voucher inside this period">
          <span>
            {openingVouchers.map((v) => `${v.voucherNo} (${v.date})`).join(", ") || "An opening-balance voucher"} falls inside the
            selected period.{" "}
            {openingVoucherAsOpening
              ? "Its amounts are shown in Opening, not in the period movement."
              : "Its amounts are included in the period movement (accounts marked with a flag)."}{" "}
            Closing balances are the same either way.
          </span>
          <div className="mt-2 flex items-center gap-2">
            <Switch id="tb-ob-as-opening" checked={openingVoucherAsOpening} onCheckedChange={setOpeningVoucherAsOpening} />
            <Label htmlFor="tb-ob-as-opening" className="cursor-pointer text-sm font-normal">
              Treat opening-balance voucher as opening
            </Label>
          </div>
        </InlineAlert>
      )}

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="tb-search" className="text-xs font-medium text-muted-foreground">
                Find account
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="tb-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name" className="pl-8" />
              </div>
            </div>
            <div className="flex min-h-9 items-center gap-2">
              <Switch id="tb-grouped" checked={grouped} onCheckedChange={setGrouped} />
              <Label htmlFor="tb-grouped" className="cursor-pointer text-sm font-normal">
                Group by type
              </Label>
            </div>
            <div className="flex min-h-9 items-center gap-2">
              <Switch id="tb-hide-zero" checked={hideZero} onCheckedChange={setHideZero} />
              <Label htmlFor="tb-hide-zero" className="cursor-pointer text-sm font-normal">
                Hide zero balances
              </Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FetchingIndicator active={tb.isFetching && !tb.isLoading} />
            <ReportExportMenu
              baseName="trial-balance"
              onCsv={exportCsv}
              disabled={view.rows.length === 0}
              buildDocument={() =>
                view.rows.length
                  ? trialBalanceDocument(view, grouped, { from: rangeStr.from, to: rangeStr.to }, { branchName, note: openingNote })
                  : null
              }
            />
            <Button variant="outline" onClick={() => void print()} disabled={view.rows.length === 0} loading={printing}>
              <Printer aria-hidden />
              Print
            </Button>
            <Button variant="outline" onClick={() => void tb.refetch()} aria-label="Refresh trial balance">
              <RefreshCw aria-hidden />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <QueryState
        isLoading={tb.isLoading}
        error={tb.error}
        onRetry={() => void tb.refetch()}
        retrying={tb.isFetching}
        errorTitle="Couldn't load the trial balance"
        skeleton={<SkeletonTable rows={10} cols={8} />}
        isEmpty={view.rows.length === 0}
        empty={
          search || (hideZero && accounts.length > 0)
            ? {
                icon: search ? Search : ListTree,
                title: search ? "No account matches" : "Every balance is zero",
                description: search
                  ? "Try another code or name."
                  : "No account has an opening balance or movement for this period. Turn off “Hide zero balances” to list them.",
                action: search ? { label: "Clear search", onClick: () => setSearch(""), icon: X } : { label: "Show all accounts", onClick: () => setHideZero(false) },
              }
            : {
                icon: Scale,
                title: "Nothing posted yet",
                description: "No posted vouchers up to the end of this period. Sales, purchases, payments, journals and opening balances appear here once posted.",
              }
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {periodLabel} · {scopeLabel}
          {openingNote ? ` · ${openingNote}` : ""}
        </p>
        <ScrollTable label="Trial balance with opening and closing balances">
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead rowSpan={2} className="sticky left-0 z-[2] w-24 bg-muted align-bottom">
                Code
              </TableHead>
              <TableHead rowSpan={2} className="min-w-[200px] align-bottom">
                Account
              </TableHead>
              <TableHead colSpan={2} className="border-l border-border/60 text-center">
                Opening
              </TableHead>
              <TableHead colSpan={2} className="border-l border-border/60 text-center">
                Period
              </TableHead>
              <TableHead colSpan={2} className="border-l border-border/60 text-center">
                Closing
              </TableHead>
            </TableRow>
            <TableRow>
              {["Dr", "Cr", "Debit", "Credit", "Dr", "Cr"].map((h, i) => (
                <TableHead key={`${h}-${i}`} className={cn("min-w-[104px] text-right", pairStart(i))}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {grouped ? (
            view.groups.map((g) => (
              <Fragment key={g.type}>
                <TableBody className="border-b">
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={8} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                      {g.label} <span className="font-normal normal-case text-muted-foreground">· {g.rows.length}</span>
                    </TableCell>
                  </TableRow>
                  {g.rows.map((r) => renderRow(r, true))}
                  <TableRow className="font-medium hover:bg-transparent">
                    <TableCell colSpan={2} className="pl-6 text-muted-foreground">
                      Total {g.label.toLowerCase()}
                    </TableCell>
                    {totalCells(g.totals, false, "border-t")}
                  </TableRow>
                </TableBody>
              </Fragment>
            ))
          ) : (
            <TableBody>{view.rows.map((r) => renderRow(r, false))}</TableBody>
          )}
          <TableFooter className={stickyFooterClass}>
            {filtered && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="text-muted-foreground">
                  Shown accounts{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
                </TableCell>
                {totalCells(shownTotals, false)}
              </TableRow>
            )}
            <TableRow className={totalsRowClass}>
              <TableCell colSpan={2}>
                <div className="flex flex-col gap-1">
                  <span>Grand total — all accounts</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-normal">
                    {pairStatus(balance.opening, "Opening")}
                    {pairStatus(balance.movement, "Movement")}
                    {pairStatus(balance.closing, "Closing")}
                  </span>
                </div>
              </TableCell>
              {totalCells(totals, true)}
            </TableRow>
          </TableFooter>
        </ScrollTable>
        <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Select any account to open its general ledger for this period.</span>
          <BalanceStatus
            balanced={balance.all}
            difference={balance.closingDifference || balance.movementDifference || balance.openingDifference}
            balancedLabel="Opening, movement and closing all balance"
            className="text-xs"
          />
        </div>
      </QueryState>
    </div>
  )
}
