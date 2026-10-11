"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Ban,
  Download,
  Eye,
  FilePen,
  FileStack,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  Undo2,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { cn } from "@/lib/utils"
import type { AccountingAccount, AccountingVoucherRow } from "@/features/accounting/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useTrialBalance } from "@/features/accounting/hooks/use-accounting-reports"
import { usePrintVoucher, useVoucherList, useVoucherStatusCounts } from "@/features/accounting/hooks/use-vouchers"
import { useVoucherRegisterState } from "@/features/accounting/hooks/use-voucher-register-state"
import { toVoucherListParams, type SourceOption, type StatusOption } from "@/features/accounting/lib/voucher-register-params"
import { VOUCHER_PAGE_SIZES } from "@/lib/api/accounting-api"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { referenceTypeLabel } from "@/features/accounting/lib/reference-routes"
import {
  isBalanced,
  VOUCHER_TYPE_OPTIONS,
  voucherIdentifier,
  voucherTypeLabel,
} from "@/features/accounting/lib/voucher-meta"
import { VoucherDetailSheet } from "@/features/accounting/components/voucher-detail-sheet"
import { EditDraftDialog } from "@/features/accounting/components/edit-draft-dialog"
import { useVoucherActions, voucherCapabilities } from "@/features/accounting/components/voucher-actions"
import {
  BalanceStatus,
  FetchingIndicator,
  MoneyCell,
  QueryState,
  ScrollTable,
  VoucherSourceBadge,
  VoucherStatusBadge,
  stickyFooterClass,
  stickyHeaderClass,
  totalsRowClass,
} from "../accounting-ui"
import { useAccountingContext } from "../accounting-context"
import { useNewJournalDialog } from "../new-journal-dialog"
import { useBranchNames } from "@/features/branches/components/branch-filter"

export type SourceFilter = SourceOption

const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "posted", label: "Posted" },
  { value: "draft", label: "Draft" },
  { value: "void", label: "Void (all)" },
  { value: "reversed", label: "Reversed" },
  { value: "voided", label: "Voided (no reversal)" },
  { value: "reversal", label: "Reversals" },
]

const SEARCH_DEBOUNCE_MS = 350

interface DateRange {
  from: Date
  to: Date
}

interface VoucherRegisterTabProps {
  dateRange: DateRange | undefined
  branchFilterId: string
  accounts: AccountingAccount[]
  /** Source filter to start on (the Manual journals tab opens on "manual"). */
  initialSource?: SourceFilter
}

export default function VoucherRegisterTab({ dateRange, branchFilterId, accounts, initialSource = "all" }: VoucherRegisterTabProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const { rangeStr, branchName } = useAccountingContext()
  // Rows can span branches when no branch is selected: show each voucher's branch and print with it.
  const { branchName: branchNameOf, multiBranch, canViewAll } = useBranchNames()
  const showBranchColumn = canViewAll && multiBranch && !branchFilterId
  const printVoucher = usePrintVoucher()
  const newJournal = useNewJournalDialog()

  const { state, update } = useVoucherRegisterState(initialSource === "manual" ? "mj" : "vr", { source: initialSource })
  const { page, pageSize, status, voucherType, source } = state
  const [searchInput, setSearchInput] = useState(state.search)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<AccountingVoucherRow | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)

  const branchId = branchFilterId || undefined
  const period = { from: rangeStr.from, to: rangeStr.to, branchId }
  const enabled = !!dateRange

  const req = toVoucherListParams(state, period)
  const list = useVoucherList(
    {
      from: period.from,
      to: period.to,
      branchId,
      status: req.status,
      voucherType: req.voucherType,
      source: req.source,
      search: req.search,
      page,
      pageSize,
    },
    enabled
  )
  const counts = useVoucherStatusCounts(period, enabled)
  const tb = useTrialBalance(period, enabled)

  const actions = useVoucherActions()

  // Keep the search box in step with the URL (back/forward, clear filters)…
  useEffect(() => {
    setSearchInput(state.search)
  }, [state.search])
  // …and push typing to the URL (server-side search) after a short pause.
  useEffect(() => {
    if (searchInput.trim() === state.search.trim()) return
    const t = setTimeout(() => update({ search: searchInput }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput, state.search, update])

  // A new period or branch starts again from the first page (not on first render: the URL page wins).
  const periodKey = `${rangeStr.from}|${rangeStr.to}|${branchId ?? ""}`
  const lastPeriodKey = useRef(periodKey)
  useEffect(() => {
    if (lastPeriodKey.current === periodKey) return
    lastPeriodKey.current = periodKey
    if (page !== 1) update({ page: 1 })
  }, [periodKey, page, update])

  const rows = useMemo(() => list.data?.data ?? [], [list.data])
  const meta = list.data?.meta
  const totalPages = Math.max(1, meta?.totalPages ?? 1)
  const totalItems = meta?.total ?? rows.length

  // A page past the end (e.g. after filters shrank the result) snaps to the last page.
  useEffect(() => {
    if (meta && !list.isFetching && page > totalPages) update({ page: totalPages })
  }, [meta, list.isFetching, page, totalPages, update])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.debit += Number(r.total_debit || 0)
          acc.credit += Number(r.total_credit || 0)
          if (!isBalanced(Number(r.total_debit || 0), Number(r.total_credit || 0))) acc.unbalanced += 1
          return acc
        },
        { debit: 0, credit: 0, unbalanced: 0 }
      ),
    [rows]
  )

  const tbTotals = useMemo(() => {
    const r = tb.data?.rows ?? []
    return {
      debit: r.reduce((s, x) => s + Number(x.debit_total || 0), 0),
      credit: r.reduce((s, x) => s + Number(x.credit_total || 0), 0),
    }
  }, [tb.data])

  const filtersActive = status !== "all" || voucherType !== "all" || source !== initialSource || state.search.trim() !== ""

  const resetFilters = () => {
    setSearchInput("")
    update({ status: "all", voucherType: "all", source: initialSource, search: "", page: 1 })
  }

  const handlePrint = async (id: string, voucherBranchId?: string | null) => {
    setPrintingId(id)
    try {
      // The voucher's own branch wins; the filter's branch is only a fallback for rows without one.
      await printVoucher(id, { branchName: voucherBranchId ? branchNameOf(voucherBranchId) : branchName })
    } catch (e) {
      toast({ title: "Print failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setPrintingId(null)
    }
  }

  const exportCsv = () => {
    if (!rows.length) {
      toast({ title: "No vouchers to export", variant: "destructive" })
      return
    }
    const data = rows.map((v) => [
      v.voucher_no,
      v.voucher_date,
      formatBsYmd(v.voucher_date),
      v.voucher_type,
      v.source,
      voucherIdentifier(v),
      v.status,
      v.narration || "",
      v.reference_type || "",
      v.reference_id || "",
      v.reverses_voucher_no || "",
      v.reversed_by_voucher_no || "",
      Number(v.total_debit || 0).toFixed(2),
      Number(v.total_credit || 0).toFixed(2),
    ])
    data.push(["TOTAL", "", "", "", "", "", "", "", "", "", "", "", totals.debit.toFixed(2), totals.credit.toFixed(2)])
    downloadCsv(
      `voucher-register-${rangeStr.from}-to-${rangeStr.to}${totalPages > 1 ? `-page-${page}` : ""}.csv`,
      ["Voucher No", "Date (AD)", "Date (BS)", "Type", "Source", "Identifier", "Status", "Narration", "Reference type", "Reference id", "Reversal of", "Reversed by", "Debit", "Credit"],
      data
    )
  }

  const pageBalanced = isBalanced(totals.debit, totals.credit)
  const periodBalanced = isBalanced(tbTotals.debit, tbTotals.credit)
  const c = counts.data

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard
          label="Vouchers in period"
          value={c ? c.total.toLocaleString() : "—"}
          hint={
            c
              ? `${c.posted} posted · ${c.draft} draft · ${c.void} void${c.reversed ? ` (${c.reversed} reversed)` : ""}`
              : counts.error
                ? "Counts unavailable"
                : undefined
          }
          icon={FileStack}
          tone="primary"
          loading={counts.isLoading}
        />
        <StatCard
          label="Posted debits"
          value={tb.data ? money(tbTotals.debit) : "—"}
          hint="All posted vouchers in the period"
          icon={Scale}
          tone="info"
          loading={tb.isLoading}
        />
        <StatCard
          label="Posted credits"
          value={tb.data ? money(tbTotals.credit) : "—"}
          hint={tb.data ? (periodBalanced ? "Equal to debits — books balance" : "Differs from debits — investigate") : undefined}
          icon={Scale}
          tone={tb.data && !periodBalanced ? "danger" : "success"}
          loading={tb.isLoading}
        />
        <StatCard
          label="Drafts to post"
          value={c ? c.draft.toLocaleString() : "—"}
          hint={
            totals.unbalanced > 0
              ? `${totals.unbalanced} unbalanced voucher${totals.unbalanced === 1 ? "" : "s"} on this page`
              : c && c.draft > 0
                ? "Select to show drafts only"
                : "Nothing waiting"
          }
          icon={totals.unbalanced > 0 ? AlertTriangle : FilePen}
          tone={totals.unbalanced > 0 ? "danger" : c && c.draft > 0 ? "warning" : "default"}
          loading={counts.isLoading}
          onClick={c && c.draft > 0 ? () => update({ status: status === "draft" ? "all" : "draft" }) : undefined}
          active={status === "draft"}
        />
      </StatGrid>

      <Card className="gap-0 py-0">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
              <div className="col-span-2 min-w-0 space-y-1.5 sm:w-64">
                <Label htmlFor="vr-search" className="text-xs font-medium text-muted-foreground">
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="vr-search"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") update({ search: searchInput })
                    }}
                    maxLength={128}
                    placeholder="Voucher no, narration, reference…"
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5 sm:w-36">
                <Label htmlFor="vr-status" className="text-xs font-medium text-muted-foreground">
                  Status
                </Label>
                <Select value={status} onValueChange={(v) => update({ status: v as StatusOption })}>
                  <SelectTrigger id="vr-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5 sm:w-36">
                <Label htmlFor="vr-source" className="text-xs font-medium text-muted-foreground">
                  Source
                </Label>
                <Select value={source} onValueChange={(v) => update({ source: v as SourceFilter })}>
                  <SelectTrigger id="vr-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="manual">Manual (MJE)</SelectItem>
                    <SelectItem value="system">System (SYS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 min-w-0 space-y-1.5 sm:w-48">
                <Label htmlFor="vr-type" className="text-xs font-medium text-muted-foreground">
                  Voucher type
                </Label>
                <Select value={voucherType} onValueChange={(v) => update({ voucherType: v })}>
                  <SelectTrigger id="vr-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {VOUCHER_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {filtersActive && (
                <Button variant="ghost" size="sm" className="col-span-2 w-fit sm:mb-0.5" onClick={resetFilters}>
                  <X aria-hidden />
                  Clear filters
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FetchingIndicator active={list.isFetching && !list.isLoading} />
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download aria-hidden />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => { void list.refetch(); void counts.refetch(); void tb.refetch() }} aria-label="Refresh vouchers">
                <RefreshCw aria-hidden />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <QueryState
        isLoading={list.isLoading || (!list.data && list.isFetching)}
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
        errorTitle="Couldn't load the voucher register"
        skeleton={<SkeletonTable rows={10} cols={8} />}
        isEmpty={!dateRange || rows.length === 0}
        empty={
          !dateRange
            ? { icon: ListOrdered, title: "Choose a period", description: "Pick a period above to list its vouchers." }
            : filtersActive
              ? {
                  icon: Search,
                  title: "No vouchers match these filters",
                  description: "Try another status, type or search term, or clear the filters.",
                  action: { label: "Clear filters", onClick: resetFilters, icon: X },
                }
              : {
                  icon: ListOrdered,
                  title: "No vouchers in this period",
                  description:
                    "Sales, purchases, payments and manual journals post vouchers here. Widen the period or record a manual journal.",
                  action: newJournal.canWrite ? { label: "New journal", onClick: newJournal.open, icon: Plus } : undefined,
                }
        }
      >
        <ScrollTable label="Voucher register">
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead className="min-w-[104px]">Date</TableHead>
              <TableHead className="min-w-[120px]">Voucher</TableHead>
              <TableHead className="min-w-[120px]">Type</TableHead>
              {showBranchColumn && <TableHead>Branch</TableHead>}
              <TableHead className="min-w-[220px]">Narration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => {
              const dr = Number(v.total_debit || 0)
              const cr = Number(v.total_credit || 0)
              const balanced = isBalanced(dr, cr)
              const caps = voucherCapabilities(v)
              return (
                <TableRow
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  data-state={selectedId === v.id ? "selected" : undefined}
                  className={cn("cursor-pointer", v.status === "void" && "text-muted-foreground")}
                >
                  <TableCell className="whitespace-nowrap py-2">
                    <span className="num block">{v.voucher_date}</span>
                    <span className="num block text-xs text-muted-foreground">BS {formatBsYmd(v.voucher_date)}</span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-col items-start gap-1">
                      <button
                        type="button"
                        className="rounded-sm font-mono text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(v.id)
                        }}
                        aria-label={`View voucher ${v.voucher_no}`}
                      >
                        <span className={cn(v.status === "void" && "line-through decoration-muted-foreground/60")}>
                          {v.voucher_no || "—"}
                        </span>
                      </button>
                      <VoucherSourceBadge voucher={v} />
                      <ReversalLinks voucher={v} onOpen={setSelectedId} />
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="block">{voucherTypeLabel(v.voucher_type)}</span>
                    {v.line_count != null && (
                      <span className="text-xs text-muted-foreground">
                        {v.line_count} line{v.line_count === 1 ? "" : "s"}
                      </span>
                    )}
                  </TableCell>
                  {showBranchColumn && <TableCell className="whitespace-nowrap py-2 text-sm">{branchNameOf(v.branch_id)}</TableCell>}
                  <TableCell className="max-w-[320px] py-2">
                    <span className="line-clamp-1" title={v.narration || undefined}>
                      {v.narration || <span className="text-muted-foreground">—</span>}
                    </span>
                    {v.reference_type && (
                      <span className="text-xs text-muted-foreground">{referenceTypeLabel(v.reference_type)}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <VoucherStatusBadge status={v.status} />
                  </TableCell>
                  <MoneyCell value={dr} className="py-2" />
                  <TableCell className="num whitespace-nowrap py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      {!balanced && (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Unbalanced voucher" />
                      )}
                      <MoneyText value={cr} />
                    </span>
                  </TableCell>
                  <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${v.voucher_no}`} className="h-9 w-9">
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="font-mono text-xs">{v.voucher_no}</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setSelectedId(v.id)}>
                          <Eye aria-hidden />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={printingId === v.id} onSelect={() => void handlePrint(v.id, v.branch_id)}>
                          <Printer aria-hidden />
                          {printingId === v.id ? "Preparing…" : "Print"}
                        </DropdownMenuItem>
                        {(caps.canEdit || caps.canPost) && <DropdownMenuSeparator />}
                        {caps.canEdit && (
                          <DropdownMenuItem onSelect={() => setEditTarget(v)}>
                            <Pencil aria-hidden />
                            Edit draft
                          </DropdownMenuItem>
                        )}
                        {caps.canPost && (
                          <DropdownMenuItem onSelect={() => actions.request("post", v)}>
                            <Send aria-hidden />
                            Post
                          </DropdownMenuItem>
                        )}
                        {(caps.canReverse || caps.canVoid || caps.canDelete) && <DropdownMenuSeparator />}
                        {caps.canReverse && (
                          <DropdownMenuItem variant="destructive" onSelect={() => actions.request("reverse", v)}>
                            <RotateCcw aria-hidden />
                            Reverse…
                          </DropdownMenuItem>
                        )}
                        {caps.canVoid && (
                          <DropdownMenuItem variant="destructive" onSelect={() => actions.request("void", v)}>
                            <Ban aria-hidden />
                            Void…
                          </DropdownMenuItem>
                        )}
                        {caps.canDelete && (
                          <DropdownMenuItem variant="destructive" onSelect={() => actions.request("delete", v)}>
                            <Trash2 aria-hidden />
                            Delete draft…
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter className={stickyFooterClass}>
            <TableRow className={totalsRowClass}>
              <TableCell colSpan={showBranchColumn ? 6 : 5}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {rows.length} voucher{rows.length === 1 ? "" : "s"} on this page
                    {` · ${totalItems.toLocaleString()} total`}
                    {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
                  </span>
                  <BalanceStatus balanced={pageBalanced} difference={totals.debit - totals.credit} className="font-normal" />
                </div>
              </TableCell>
              <MoneyCell value={totals.debit} strong />
              <MoneyCell value={totals.credit} strong />
              <TableCell />
            </TableRow>
          </TableFooter>
        </ScrollTable>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Label htmlFor="vr-page-size" className="whitespace-nowrap text-sm font-normal">
              Rows per page
            </Label>
            <Select value={String(pageSize)} onValueChange={(v) => update({ pageSize: Number(v), page: 1 })}>
              <SelectTrigger id="vr-page-size" className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {totalPages <= 1 && (
              <span className="num">
                {totalItems.toLocaleString()} voucher{totalItems === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <Pagination
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={pageSize}
            startIndex={(Math.min(page, totalPages) - 1) * pageSize}
            onPageChange={(p) => update({ page: p })}
            className="flex-col gap-2 sm:flex-row sm:gap-4 [&>div]:flex-wrap"
          />
        </div>
      </QueryState>

      <VoucherDetailSheet
        voucherId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
        branchName={branchName}
        onEditDraft={(v) => {
          setSelectedId(null)
          setEditTarget(v)
        }}
      />
      <EditDraftDialog voucher={editTarget} accounts={accounts} onClose={() => setEditTarget(null)} />
      {actions.element}
    </div>
  )
}

/** "Reversal of SV-…" on a reversing voucher; "Reversed by RV-…" on a reversed original. Each opens that voucher. */
function ReversalLinks({ voucher, onOpen }: { voucher: AccountingVoucherRow; onOpen: (id: string) => void }) {
  const link = (id: string, label: string, no: string, icon: "of" | "by") => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(id)
      }}
      className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label} ${no} — open voucher`}
    >
      {icon === "of" ? <Undo2 className="h-3 w-3" aria-hidden /> : <RotateCcw className="h-3 w-3" aria-hidden />}
      {label} <span className="font-mono">{no}</span>
    </button>
  )
  return (
    <>
      {voucher.reverses_voucher_id &&
        link(voucher.reverses_voucher_id, "Reversal of", voucher.reverses_voucher_no || "voucher", "of")}
      {voucher.reversed_by_voucher_id &&
        link(voucher.reversed_by_voucher_id, "Reversed by", voucher.reversed_by_voucher_no || "voucher", "by")}
    </>
  )
}

function MoneyText({ value }: { value: number }) {
  const { amount } = useAccountingMoney()
  return <>{amount(value)}</>
}
