"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { ArrowDownRight, ArrowUpRight, BookMarked, Download, Landmark, RefreshCw, Sigma } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { accountingApi, type AccountingAccount } from "@/features/accounting/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { AccountCombobox, ACCOUNT_TYPE_LABEL } from "@/features/accounting/components/account-combobox"
import { VoucherDetailSheet } from "@/features/accounting/components/voucher-detail-sheet"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import {
  Amount,
  FetchingIndicator,
  MoneyCell,
  QueryState,
  ScrollTable,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"

// The .NET general-ledger report pages its detail lines (`PagedResponse<GeneralLedgerLineDto>` on
// `lines`), so each page turn requests only that page. Opening/closing balances always cover the
// whole period. CSV export walks every page (accountingApi.generalLedger) rather than exporting the
// page on screen.
const GL_PAGE_SIZE = 50

interface DateRange {
  from: Date
  to: Date
}

interface GlRow {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  line_no: number
  description: string | null
  debit_amount: number
  credit_amount: number
  running_balance: number
}

interface GeneralLedgerTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
  accounts: AccountingAccount[]
  accountsLoading: boolean
  glAccountId: string
  setGlAccountId: Dispatch<SetStateAction<string>>
  glRows: GlRow[]
  setGlRows: Dispatch<SetStateAction<GlRow[]>>
  glOpening: number
  setGlOpening: Dispatch<SetStateAction<number>>
  glClosing: number
  setGlClosing: Dispatch<SetStateAction<number>>
  glPage: number
  setGlPage: Dispatch<SetStateAction<number>>
  glTotalCount: number
  setGlTotalCount: Dispatch<SetStateAction<number>>
  glTotalPages: number
  setGlTotalPages: Dispatch<SetStateAction<number>>
  glLoading: boolean
  setGlLoading: Dispatch<SetStateAction<boolean>>
}

export default function GeneralLedgerTab({
  dateRange,
  branchFilterId,
  accounts,
  accountsLoading,
  glAccountId,
  setGlAccountId,
  glRows,
  setGlRows,
  glOpening,
  setGlOpening,
  glClosing,
  setGlClosing,
  glPage,
  setGlPage,
  glTotalCount,
  setGlTotalCount,
  glTotalPages,
  setGlTotalPages,
  glLoading,
  setGlLoading,
}: GeneralLedgerTabProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const { branchName, glLoadedKey, setGlLoadedKey } = useAccountingContext()
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null)

  const rangeStr = useMemo(() => {
    if (!dateRange) return { from: "", to: "" }
    return { from: formatLocalDateYmd(dateRange.from), to: formatLocalDateYmd(dateRange.to) }
  }, [dateRange])

  const reportBranchId = branchFilterId || undefined
  const loadKey = `${glAccountId}|${rangeStr.from}|${rangeStr.to}|${reportBranchId ?? ""}`
  // Skip the first fetch only when the held rows were loaded for exactly this account, period and branch
  // (e.g. a trial-balance drill-down); rows from another period/branch are reloaded.
  const loadedKeyRef = useRef<string | null>(glLoadedKey || null)

  const loadGeneralLedgerPage = useCallback(
    async (page: number) => {
      if (!dateRange || !glAccountId) return
      setGlLoading(true)
      setError(null)
      try {
        const res = await accountingApi.generalLedgerPage(glAccountId, rangeStr.from, rangeStr.to, reportBranchId, page, GL_PAGE_SIZE)
        setGlOpening(Number(res.opening_balance ?? 0))
        setGlClosing(Number(res.closing_balance ?? 0))
        setGlRows((res.rows || []) as GlRow[])
        setGlPage(res.pageNumber)
        setGlTotalCount(res.totalCount)
        setGlTotalPages(Math.max(1, res.totalPages))
        setGlLoadedKey(`${glAccountId}|${rangeStr.from}|${rangeStr.to}|${reportBranchId ?? ""}`)
      } catch (e) {
        setError(e)
        setGlRows([])
        setGlTotalCount(0)
      } finally {
        setGlLoading(false)
      }
    },
    [dateRange, glAccountId, rangeStr.from, rangeStr.to, reportBranchId, setGlLoading, setGlOpening, setGlClosing, setGlRows, setGlPage, setGlTotalCount, setGlTotalPages, setGlLoadedKey]
  )

  // Load automatically whenever the account, period or branch changes.
  useEffect(() => {
    if (!glAccountId || !dateRange) return
    if (loadedKeyRef.current === loadKey) return
    loadedKeyRef.current = loadKey
    void loadGeneralLedgerPage(1)
  }, [loadKey, glAccountId, dateRange, loadGeneralLedgerPage])

  const pageTotals = useMemo(() => {
    const debit = glRows.reduce((sum, row) => sum + Number(row.debit_amount || 0), 0)
    const credit = glRows.reduce((sum, row) => sum + Number(row.credit_amount || 0), 0)
    return { debit, credit }
  }, [glRows])

  const glPageClamped = Math.min(glPage, glTotalPages)
  const glPageStart = (glPageClamped - 1) * GL_PAGE_SIZE

  const exportLedgerCsv = useCallback(async () => {
    if (!glAccountId || !dateRange || glTotalCount === 0) {
      toast({ title: "No ledger rows to export", variant: "destructive" })
      return
    }
    setIsExporting(true)
    try {
      const full = await accountingApi.generalLedger(glAccountId, rangeStr.from, rangeStr.to, reportBranchId)
      const allRows = full.rows as GlRow[]
      const debit = allRows.reduce((sum, row) => sum + Number(row.debit_amount || 0), 0)
      const credit = allRows.reduce((sum, row) => sum + Number(row.credit_amount || 0), 0)
      const rows: (string | number)[][] = [["", "", "", "", "Opening balance", "", "", Number(full.opening_balance ?? 0).toFixed(2)]]
      for (const r of allRows) {
        rows.push([
          r.voucher_date,
          formatBsYmd(r.voucher_date),
          r.voucher_no,
          r.line_no,
          r.description || "",
          Number(r.debit_amount || 0).toFixed(2),
          Number(r.credit_amount || 0).toFixed(2),
          Number(r.running_balance || 0).toFixed(2),
        ])
      }
      rows.push(["TOTAL", "", "", "", "", debit.toFixed(2), credit.toFixed(2), glClosing.toFixed(2)])
      const acct = accounts.find((a) => a.id === glAccountId)
      downloadCsv(
        `general-ledger-${acct?.code ?? "account"}-${rangeStr.from}-to-${rangeStr.to}.csv`,
        ["Date (AD)", "Date (BS)", "Voucher", "Line", "Memo", "Debit", "Credit", "Running Balance"],
        rows
      )
    } catch (e) {
      toast({ title: "Export failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setIsExporting(false)
    }
  }, [accounts, glAccountId, dateRange, glTotalCount, glClosing, rangeStr.from, rangeStr.to, reportBranchId, toast])

  const selectedAccount = accounts.find((a) => a.id === glAccountId)
  const movement = glClosing - glOpening
  const hasData = glRows.length > 0

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
          <div className="w-full space-y-1.5 sm:w-[360px]">
            <Label htmlFor="gl-account" className="text-xs font-medium text-muted-foreground">
              Account
            </Label>
            <AccountCombobox
              id="gl-account"
              accounts={accounts}
              value={glAccountId}
              onChange={setGlAccountId}
              placeholder={accountsLoading ? "Loading accounts…" : "Search and select an account"}
              disabled={accountsLoading}
              activeOnly={false}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FetchingIndicator active={glLoading && hasData} />
            <Button
              variant="outline"
              onClick={() => void exportLedgerCsv()}
              disabled={glTotalCount === 0}
              loading={isExporting}
              loadingText="Exporting…"
            >
              <Download aria-hidden />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadGeneralLedgerPage(glPageClamped || 1)}
              disabled={!glAccountId || !dateRange}
              aria-label="Refresh ledger"
            >
              <RefreshCw aria-hidden />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {glAccountId && (
        <StatGrid cols={4}>
          <StatCard
            label="Opening balance"
            value={<Amount value={glOpening} withSymbol />}
            hint="Before the period (Dr − Cr)"
            icon={Landmark}
            loading={glLoading && !hasData && !error}
          />
          <StatCard
            label="Net movement"
            value={<Amount value={movement} withSymbol />}
            hint={movement >= 0 ? "Net debit in the period" : "Net credit in the period"}
            icon={movement >= 0 ? ArrowUpRight : ArrowDownRight}
            tone="info"
            loading={glLoading && !hasData && !error}
          />
          <StatCard
            label="Closing balance"
            value={<Amount value={glClosing} withSymbol />}
            hint={selectedAccount ? `${selectedAccount.code} · ${ACCOUNT_TYPE_LABEL[selectedAccount.account_type] ?? selectedAccount.account_type}` : undefined}
            icon={Sigma}
            tone="primary"
            loading={glLoading && !hasData && !error}
          />
          <StatCard
            label="Postings"
            value={glTotalCount.toLocaleString()}
            hint={glTotalPages > 1 ? `${glTotalPages} pages of ${GL_PAGE_SIZE}` : "Posted vouchers only"}
            icon={BookMarked}
            loading={glLoading && !hasData && !error}
          />
        </StatGrid>
      )}

      <QueryState
        isLoading={glLoading && !hasData}
        error={error}
        onRetry={() => void loadGeneralLedgerPage(glPageClamped || 1)}
        retrying={glLoading}
        errorTitle="Couldn't load the ledger"
        skeleton={<SkeletonTable rows={10} cols={6} />}
        isEmpty={!hasData}
        empty={
          glAccountId
            ? {
                icon: BookMarked,
                title: "No postings in this period",
                description: `No posted vouchers hit this account in the selected period. Opening and closing balance: ${money(glClosing)}. Widen the period or pick another account.`,
              }
            : {
                icon: BookMarked,
                title: "Choose an account",
                description: "Search for an account above to see every posting with a running balance. Tip: select any account in the trial balance to jump here.",
              }
        }
      >
        <ScrollTable label={`Ledger for ${selectedAccount?.name ?? "account"}`}>
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead className="min-w-[104px]">Date</TableHead>
              <TableHead className="min-w-[110px]">Voucher</TableHead>
              <TableHead className="min-w-[220px]">Narration</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {glPageClamped === 1 && (
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={5} className="text-sm italic text-muted-foreground">
                  Opening balance
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Amount value={glOpening} />
                </TableCell>
              </TableRow>
            )}
            {glRows.map((r, i) => (
              <TableRow
                key={`${r.voucher_id}-${r.line_no}-${glPageStart + i}`}
                className="cursor-pointer"
                onClick={() => setSelectedVoucherId(r.voucher_id)}
              >
                <TableCell className="whitespace-nowrap py-2">
                  <span className="num block">{r.voucher_date}</span>
                  <span className="num block text-xs text-muted-foreground">BS {formatBsYmd(r.voucher_date)}</span>
                </TableCell>
                <TableCell className="py-2">
                  <button
                    type="button"
                    className="rounded-sm font-mono text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedVoucherId(r.voucher_id)
                    }}
                    aria-label={`View voucher ${r.voucher_no}`}
                  >
                    {r.voucher_no}
                  </button>
                </TableCell>
                <TableCell className="max-w-[340px] py-2">
                  <span className="line-clamp-1" title={r.description || undefined}>
                    {r.description || <span className="text-muted-foreground">—</span>}
                  </span>
                </TableCell>
                <MoneyCell value={r.debit_amount} blankZero className="py-2" />
                <MoneyCell value={r.credit_amount} blankZero className="py-2" />
                <TableCell className="py-2 text-right font-medium">
                  <Amount value={r.running_balance} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className={stickyFooterClass}>
            <TableRow className={totalsRowClass}>
              <TableCell colSpan={3}>
                {glTotalPages > 1 ? `Page ${glPageClamped} of ${glTotalPages} subtotal · closing balance for the full period` : "Totals · closing balance"}
              </TableCell>
              <MoneyCell value={pageTotals.debit} strong />
              <MoneyCell value={pageTotals.credit} strong />
              <TableCell className="text-right">
                <Amount value={glClosing} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </ScrollTable>
        <Pagination
          currentPage={glPageClamped}
          totalPages={glTotalPages}
          totalItems={glTotalCount}
          itemsPerPage={GL_PAGE_SIZE}
          startIndex={glPageStart}
          onPageChange={(page) => void loadGeneralLedgerPage(page)}
          className="mt-3"
        />
      </QueryState>

      <VoucherDetailSheet
        voucherId={selectedVoucherId}
        onOpenChange={(open) => !open && setSelectedVoucherId(null)}
        branchName={branchName}
        onActionDone={() => void loadGeneralLedgerPage(glPageClamped || 1)}
      />
    </div>
  )
}
