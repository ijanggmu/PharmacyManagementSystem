"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Banknote, Download, Info, Landmark, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { bankDepositsApi } from "@/features/bank-deposits/api-client"
import { cashShiftsApi, type CashShift } from "@/features/cash-shifts/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useCashMovement } from "@/features/accounting/hooks/use-accounting-reports"
import { ACCOUNTING_ROOT_KEY, useAccountingReport } from "@/features/accounting/hooks/use-vouchers"
import { VoucherDetailSheet } from "@/features/accounting/components/voucher-detail-sheet"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { referenceTypeLabel } from "@/features/accounting/lib/reference-routes"
import {
  Amount,
  FetchingIndicator,
  InlineAlert,
  MoneyCell,
  QueryState,
  ScrollTable,
  SectionHeading,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "../accounting-ui"
import { SwitchBranchNotice, useIsOtherBranch } from "@/features/branches/components/switch-branch-notice"
import { useAccountingContext } from "../accounting-context"

const DEPOSITS_PAGE_SIZE = 20

interface DateRange {
  from: Date
  to: Date
}

interface CashBankTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
}

function MovementCard({
  title,
  icon: Icon,
  m,
}: {
  title: string
  icon: LucideIcon
  m: { opening: number; receipts: number; payments: number; closing: number }
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {title}
      </p>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Opening</dt>
          <dd>
            <Amount value={m.opening} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="flex items-center gap-1 text-muted-foreground">
            <ArrowDownLeft className="h-3.5 w-3.5 text-success" aria-hidden />
            Receipts
          </dt>
          <dd className="text-success">
            + <Amount value={m.receipts} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="flex items-center gap-1 text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-destructive" aria-hidden />
            Payments
          </dt>
          <dd>
            − <Amount value={m.payments} />
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t-2 border-foreground/15 pt-1.5 font-semibold">
          <dt>Closing</dt>
          <dd>
            <Amount value={m.closing} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default function CashBankTab({ dateRange, branchFilterId }: CashBankTabProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { money } = useAccountingMoney()
  const { rangeStr, branchName } = useAccountingContext()
  const branchId = branchFilterId || undefined
  const depositElsewhere = useIsOtherBranch(branchFilterId)

  const cash = useCashMovement({ from: rangeStr.from, to: rangeStr.to, branchId }, !!dateRange)
  const [depositsPage, setDepositsPage] = useState(1)
  const deposits = useAccountingReport(
    ["bank-deposits", rangeStr.from, rangeStr.to, branchId ?? "", depositsPage],
    () => bankDepositsApi.search({ branch_id: branchId, from: rangeStr.from, to: rangeStr.to, page: depositsPage, limit: DEPOSITS_PAGE_SIZE }),
    !!dateRange
  )

  const [accountFilter, setAccountFilter] = useState<"all" | "cash" | "bank">("all")
  const [search, setSearch] = useState("")
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null)

  const [depositAmount, setDepositAmount] = useState("")
  const [depositDate, setDepositDate] = useState(formatLocalDateYmd(new Date()))
  const [depositNote, setDepositNote] = useState("")
  const [depositSaving, setDepositSaving] = useState(false)
  const [depositTouched, setDepositTouched] = useState(false)
  const [closedShifts, setClosedShifts] = useState<CashShift[]>([])
  const [depositShiftId, setDepositShiftId] = useState<string>("")

  useEffect(() => {
    setDepositsPage(1)
  }, [rangeStr.from, rangeStr.to, branchId])

  useEffect(() => {
    setDepositShiftId("")
    if (!branchFilterId) {
      setClosedShifts([])
      return
    }
    let cancelled = false
    cashShiftsApi
      .list({ branch_id: branchFilterId, status: "closed" })
      .then((shifts) => {
        if (!cancelled) setClosedShifts(shifts.slice(0, 20))
      })
      .catch(() => {
        if (!cancelled) setClosedShifts([])
      })
    return () => {
      cancelled = true
    }
  }, [branchFilterId])

  const report = cash.data
  const lines = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (report?.lines ?? [])
      .filter((l) => accountFilter === "all" || (accountFilter === "cash" ? l.account_code === "1000" : l.account_code === "1010"))
      .filter((l) => !term || [l.voucher_no, l.description, l.account_name].filter(Boolean).some((f) => String(f).toLowerCase().includes(term)))
  }, [report, accountFilter, search])
  const lineTotals = useMemo(
    () => lines.reduce((acc, l) => ({ debit: acc.debit + Number(l.debit_amount || 0), credit: acc.credit + Number(l.credit_amount || 0) }), { debit: 0, credit: 0 }),
    [lines]
  )

  const depositAmt = Number.parseFloat(depositAmount)
  const depositError = !depositAmount.trim() ? "Enter the deposit amount" : !Number.isFinite(depositAmt) || depositAmt <= 0 ? "Enter a positive amount" : undefined

  const submitBankDeposit = async () => {
    setDepositTouched(true)
    if (!branchFilterId || depositError || !depositDate) return
    setDepositSaving(true)
    try {
      await bankDepositsApi.record({
        branch_id: branchFilterId,
        amount: depositAmt,
        deposit_date: depositDate,
        reference_note: depositNote.trim() || null,
        cash_shift_id: depositShiftId || null,
      })
      toast({ title: "Bank deposit recorded", description: "Voucher: Dr Bank, Cr Cash" })
      setDepositAmount("")
      setDepositNote("")
      setDepositShiftId("")
      setDepositTouched(false)
      await qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })
    } catch (e) {
      toast({ title: "Deposit failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setDepositSaving(false)
    }
  }

  const exportCsv = () => {
    downloadCsv(
      `cash-bank-movement-${rangeStr.from}-to-${rangeStr.to}.csv`,
      ["Date (AD)", "Date (BS)", "Voucher", "Account", "Description", "Source", "Debit", "Credit"],
      lines.map((l) => [
        l.voucher_date,
        formatBsYmd(l.voucher_date),
        l.voucher_no,
        `${l.account_code} ${l.account_name}`,
        l.description,
        l.reference_type ?? "",
        Number(l.debit_amount || 0).toFixed(2),
        Number(l.credit_amount || 0).toFixed(2),
      ])
    )
  }

  const depositRows = deposits.data?.items ?? []

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard label="Cash on hand" value={report ? money(report.cash_closing) : "—"} hint="Closing balance, account 1000" icon={Banknote} tone="primary" loading={cash.isLoading} />
        <StatCard label="Bank" value={report ? money(report.bank_closing) : "—"} hint="Closing balance, account 1010" icon={Landmark} tone="info" loading={cash.isLoading} />
        <StatCard
          label="Money in"
          value={report ? money(report.money_in) : "—"}
          hint={
            report && report.internal_transfers > 0
              ? `All cash & bank accounts · excl. ${money(report.internal_transfers)} moved between them`
              : "All cash & bank accounts in the period"
          }
          icon={ArrowDownLeft}
          tone="success"
          loading={cash.isLoading}
        />
        <StatCard
          label="Money out"
          value={report ? money(report.money_out) : "—"}
          hint="All cash & bank accounts · deposits between them not counted"
          icon={ArrowUpRight}
          tone="warning"
          loading={cash.isLoading}
        />
      </StatGrid>

      <QueryState
        isLoading={cash.isLoading}
        error={cash.error}
        onRetry={() => void cash.refetch()}
        retrying={cash.isFetching}
        errorTitle="Couldn't load cash & bank movement"
        skeleton={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonTable rows={6} cols={6} />
          </div>
        }
        isEmpty={!report}
        empty={{ icon: Landmark, title: "Choose a period", description: "Pick a period above to see cash and bank movement." }}
      >
        {report && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <MovementCard
                title="Cash on hand (1000)"
                icon={Banknote}
                m={{ opening: report.cash_opening, receipts: report.cash_receipts, payments: report.cash_payments, closing: report.cash_closing }}
              />
              <MovementCard
                title="Bank (1010)"
                icon={Landmark}
                m={{ opening: report.bank_opening, receipts: report.bank_receipts, payments: report.bank_payments, closing: report.bank_closing }}
              />
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-xs">
              <SectionHeading
                title="Movements"
                description="Every posted line on cash (1000) and bank (1010). Select a line to open its voucher."
                actions={
                  <>
                    <FetchingIndicator active={cash.isFetching && !cash.isLoading} />
                    <Button variant="outline" onClick={exportCsv} disabled={lines.length === 0}>
                      <Download aria-hidden />
                      CSV
                    </Button>
                    <Button variant="outline" onClick={() => void cash.refetch()} aria-label="Refresh cash and bank movement">
                      <RefreshCw aria-hidden />
                    </Button>
                  </>
                }
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div role="group" aria-label="Account" className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1">
                  {(["all", "cash", "bank"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={accountFilter === f}
                      onClick={() => setAccountFilter(f)}
                      className={cn(
                        "min-h-9 cursor-pointer rounded-md px-3 text-xs font-medium capitalize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8",
                        accountFilter === f ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f === "all" ? "All" : f}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input type="search" aria-label="Search movements" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Voucher or description" className="pl-8" />
                </div>
              </div>
              <div className="mt-3">
                {lines.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    {report.lines.length === 0 ? "No cash or bank postings in this period." : "No movement matches the filter."}
                  </p>
                ) : (
                  <ScrollTable maxHeight="max-h-[60vh]" label="Cash and bank movements">
                    <TableHeader className={stickyHeaderClass}>
                      <TableRow>
                        <TableHead className="min-w-[104px]">Date</TableHead>
                        <TableHead>Voucher</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="text-right">In (Dr)</TableHead>
                        <TableHead className="text-right">Out (Cr)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, i) => (
                        <TableRow key={`${line.voucher_id}-${line.account_code}-${i}`} className="cursor-pointer" onClick={() => setSelectedVoucherId(line.voucher_id)}>
                          <TableCell className="whitespace-nowrap py-2">
                            <span className="num block">{line.voucher_date}</span>
                            <span className="num text-xs text-muted-foreground">BS {formatBsYmd(line.voucher_date)}</span>
                          </TableCell>
                          <TableCell className="py-2">
                            <button
                              type="button"
                              className="rounded-sm font-mono text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedVoucherId(line.voucher_id)
                              }}
                            >
                              {line.voucher_no}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2">
                            <span className="num mr-1 font-mono text-xs text-muted-foreground">{line.account_code}</span>
                            {line.account_name}
                          </TableCell>
                          <TableCell className="max-w-[260px] py-2">
                            <span className="line-clamp-1" title={line.description || undefined}>
                              {line.description || "—"}
                            </span>
                            {line.reference_type && <span className="text-xs text-muted-foreground">{referenceTypeLabel(line.reference_type)}</span>}
                          </TableCell>
                          <MoneyCell value={line.debit_amount} blankZero className="py-2 text-success" />
                          <MoneyCell value={line.credit_amount} blankZero className="py-2" />
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className={stickyFooterClass}>
                      <TableRow className={totalsRowClass}>
                        <TableCell colSpan={4}>Totals ({lines.length} lines)</TableCell>
                        <MoneyCell value={lineTotals.debit} strong />
                        <MoneyCell value={lineTotals.credit} strong />
                      </TableRow>
                    </TableFooter>
                  </ScrollTable>
                )}
              </div>
            </div>
          </div>
        )}
      </QueryState>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden />
              Record bank deposit
            </CardTitle>
            <CardDescription>Moves cash from the till to the bank (Dr Bank 1010, Cr Cash 1000).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SwitchBranchNotice targetBranchId={branchFilterId} action="record a deposit" />
            {!branchFilterId && (
              <InlineAlert tone="info">Choose a branch in the filter above to record a deposit and link it to a closed cash shift.</InlineAlert>
            )}
            <form
              className="grid gap-4 sm:grid-cols-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void submitBankDeposit()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="deposit_amt">
                  Amount <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Input
                  id="deposit_amt"
                  inputMode="decimal"
                  className="num text-right"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  aria-invalid={depositTouched && !!depositError}
                  disabled={!branchFilterId}
                />
                {depositTouched && <FieldError message={depositError} />}
                {report && report.cash_closing > 0 && branchFilterId && (
                  <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => setDepositAmount(report.cash_closing.toFixed(2))}>
                    Deposit all cash on hand (<Amount value={report.cash_closing} />)
                  </button>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="deposit_date">
                  Deposit date <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <DatePicker id="deposit_date" value={depositDate} onChange={setDepositDate} disabled={!branchFilterId || depositSaving} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="deposit_shift">From cash shift (optional)</Label>
                <Select value={depositShiftId || "none"} onValueChange={(v) => setDepositShiftId(v === "none" ? "" : v)} disabled={!branchFilterId}>
                  <SelectTrigger id="deposit_shift" className="w-full">
                    <SelectValue placeholder="Not linked to a shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked to a shift</SelectItem>
                    {closedShifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        Closed {new Date(s.closed_at || s.opened_at).toLocaleString()} — counted{" "}
                        {s.counted_cash_closing != null ? s.counted_cash_closing.toFixed(2) : "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Links the deposit to the shift whose counted cash it came from.</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="deposit_note">Reference note (optional)</Label>
                <Input id="deposit_note" value={depositNote} onChange={(e) => setDepositNote(e.target.value)} placeholder="Deposit slip no." disabled={!branchFilterId} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" className="w-full" loading={depositSaving} loadingText="Posting…" disabled={!branchFilterId || depositElsewhere}>
                  Post bank deposit
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deposits in the period</CardTitle>
            <CardDescription>{branchName ? `Branch ${branchName}` : "All branches"}</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState
              isLoading={deposits.isLoading}
              error={deposits.error}
              onRetry={() => void deposits.refetch()}
              retrying={deposits.isFetching}
              skeleton={<SkeletonTable rows={4} cols={3} />}
              isEmpty={depositRows.length === 0}
              empty={{ icon: Info, title: "No deposits in this period", description: "Deposits you record from the till appear here." }}
            >
              <ScrollTable maxHeight="max-h-96" label="Bank deposits">
                <TableHeader className={stickyHeaderClass}>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depositRows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="num block">{d.deposit_date}</span>
                        <span className="num text-xs text-muted-foreground">BS {formatBsYmd(d.deposit_date)}</span>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate" title={d.reference_note || undefined}>
                        {d.reference_note || "—"}
                      </TableCell>
                      <MoneyCell value={d.amount} strong />
                    </TableRow>
                  ))}
                </TableBody>
              </ScrollTable>
              <Pagination
                currentPage={depositsPage}
                totalPages={Math.max(1, deposits.data?.totalPages ?? 1)}
                totalItems={deposits.data?.totalCount ?? depositRows.length}
                itemsPerPage={DEPOSITS_PAGE_SIZE}
                startIndex={(depositsPage - 1) * DEPOSITS_PAGE_SIZE}
                onPageChange={setDepositsPage}
                className="mt-2"
              />
            </QueryState>
          </CardContent>
        </Card>
      </div>

      <VoucherDetailSheet voucherId={selectedVoucherId} onOpenChange={(open) => !open && setSelectedVoucherId(null)} branchName={branchName} />
    </div>
  )
}
