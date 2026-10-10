"use client"

import { useEffect, useMemo, useState } from "react"
import { useBranches } from "@/features/branches/hooks/use-branches"
import Link from "next/link"
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  ExternalLink,
  FilePen,
  FileText,
  Hash,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import type { AccountingVoucherRow } from "@/features/accounting/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { usePrintVoucher, useVoucherDetail } from "@/features/accounting/hooks/use-vouchers"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { resolveReference } from "@/features/accounting/lib/reference-routes"
import {
  displayUserName,
  isBalanced,
  isGuid,
  shortId,
  voucherIdentifier,
  voucherTypeLabel,
} from "@/features/accounting/lib/voucher-meta"
import {
  BalanceStatus,
  CopyButton,
  InlineAlert,
  MoneyCell,
  ScrollTable,
  VoucherSourceBadge,
  VoucherStatusBadge,
  stickyHeaderClass,
  totalsRowClass,
} from "./accounting-ui"
import { useVoucherActions, voucherCapabilities, type VoucherAction } from "./voucher-actions"

interface VoucherDetailSheetProps {
  /** Voucher to show; null closes the sheet. */
  voucherId: string | null
  onOpenChange: (open: boolean) => void
  /** Name of the branch in the current filter, shown when the voucher list is branch-scoped. */
  branchName?: string | null
  /** Opens the draft editor (owned by the register). Hidden when not provided. */
  onEditDraft?: (voucher: AccountingVoucherRow) => void
  /** Called after a lifecycle action succeeds (lists refresh automatically via React Query). */
  onActionDone?: (action: VoucherAction) => void
}

function formatAdLong(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

function formatInstant(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function MetaItem({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

export function VoucherDetailSheet({ voucherId, onOpenChange, branchName, onEditDraft, onActionDone }: VoucherDetailSheetProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const printVoucher = usePrintVoucher()
  const [printing, setPrinting] = useState(false)
  // Navigation stack so "Open original voucher" (on reversals) can go back.
  const [stack, setStack] = useState<string[]>([])

  useEffect(() => {
    setStack(voucherId ? [voucherId] : [])
  }, [voucherId])

  const currentId = stack[stack.length - 1] ?? null
  const { data, isLoading, error, refetch, isFetching } = useVoucherDetail(currentId)
  const actions = useVoucherActions({
    onDone: (action) => {
      onActionDone?.(action)
      if (action === "delete") onOpenChange(false)
    },
  })

  const voucher = data?.voucher
  const lines = useMemo(() => (data?.lines ?? []).slice().sort((a, b) => a.line_no - b.line_no), [data?.lines])
  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
    const credit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
    return { debit, credit, balanced: isBalanced(debit, credit) }
  }, [lines])

  const caps = voucher ? voucherCapabilities(voucher) : null
  const reference = voucher ? resolveReference(voucher.reference_type, voucher.reference_id) : null
  const postedBy = displayUserName(voucher?.posted_by)
  const { data: branches } = useBranches()
  // The voucher's own branch wins; the page's branch filter is only a fallback for old rows.
  const voucherBranchName =
    (voucher?.branch_id ? branches?.find((b) => b.id === voucher.branch_id)?.name : null) ?? branchName ?? null

  const handlePrint = async () => {
    if (!currentId) return
    setPrinting(true)
    try {
      await printVoucher(currentId, { branchName: voucherBranchName, voidReason: voucher?.void_reason ?? null })
    } catch (e) {
      toast({ title: "Print failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <Sheet open={!!voucherId} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b px-5 pb-4 pt-5 pr-12">
            {stack.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 mb-1 w-fit"
                onClick={() => setStack((s) => s.slice(0, -1))}
              >
                <ArrowLeft aria-hidden />
                Back
              </Button>
            )}
            {voucher ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="font-mono text-lg tracking-tight">{voucher.voucher_no || "Draft voucher"}</SheetTitle>
                  <VoucherSourceBadge voucher={voucher} />
                  <VoucherStatusBadge status={voucher.status} />
                </div>
                <SheetDescription>
                  {voucherTypeLabel(voucher.voucher_type)} voucher ·{" "}
                  {voucherIdentifier(voucher) === "MJE" ? "manual journal entry" : "posted by the system"}
                </SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle className="sr-only">Voucher details</SheetTitle>
                <SheetDescription className="sr-only">Loading voucher</SheetDescription>
                <Skeleton variant="text" className="h-6 w-48" />
                <Skeleton variant="text" className="w-64" />
              </>
            )}
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="space-y-5" aria-busy="true">
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} variant="text" className="h-9" />
                  ))}
                </div>
                <SkeletonTable rows={4} cols={4} />
              </div>
            ) : error ? (
              <ErrorState
                size="compact"
                title="Couldn't load this voucher"
                message={apiRequestErrorMessage(error)}
                onRetry={() => void refetch()}
                retrying={isFetching}
              />
            ) : voucher ? (
              <div className="space-y-5">
                {voucher.status === "void" && (
                  <InlineAlert tone="destructive" title="This voucher is void">
                    It no longer affects the ledger.
                    {" "}If it was reversed, the reversing journal is in the register on the reversal date.
                  </InlineAlert>
                )}
                {voucher.status === "draft" && (
                  <InlineAlert tone="info" title="Draft — not in the ledger yet">
                    Post it to include it in reports. Drafts can still be edited or deleted.
                  </InlineAlert>
                )}

                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  <MetaItem label="Voucher date">
                    <span className="flex items-start gap-1.5">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>
                        <span className="num">{formatAdLong(voucher.voucher_date)}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          BS <span className="num">{formatBsLong(voucher.voucher_date) || "—"}</span>
                        </span>
                      </span>
                    </span>
                  </MetaItem>
                  <MetaItem label="Type · source">
                    {voucherTypeLabel(voucher.voucher_type)}{" "}
                    <span className="font-normal capitalize text-muted-foreground">· {voucher.source || "—"}</span>
                  </MetaItem>
                  <MetaItem label="Posted">
                    {voucher.posted_at || voucher.posted_by ? (
                      <span className="flex items-start gap-1.5">
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span>
                          {postedBy ?? (isGuid(voucher.posted_by) ? <span title={voucher.posted_by ?? undefined}>User {shortId(voucher.posted_by)}</span> : "—")}
                          {voucher.posted_at && (
                            <span className="block text-xs font-normal text-muted-foreground">{formatInstant(voucher.posted_at)}</span>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="font-normal text-muted-foreground">Not posted</span>
                    )}
                  </MetaItem>
                  <MetaItem label="Branch">
                    {voucherBranchName ? (
                      voucherBranchName
                    ) : (
                      <span className="font-normal text-muted-foreground">All / not recorded</span>
                    )}
                  </MetaItem>
                  {voucher.void_reason ? (
                    <MetaItem label="Void reason" className="sm:col-span-2">
                      <span className="text-destructive">{voucher.void_reason}</span>
                    </MetaItem>
                  ) : null}
                  {voucher.reversed_by_voucher_id ? (
                    <MetaItem label="Reversed by" className="sm:col-span-2">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-mono"
                        onClick={() => setStack((s) => [...s, voucher.reversed_by_voucher_id as string])}
                      >
                        {voucher.reversed_by_voucher_no || "Open reversing voucher"}
                      </Button>
                    </MetaItem>
                  ) : null}
                  {voucher.reverses_voucher_id ? (
                    <MetaItem label="Reversal of" className="sm:col-span-2">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-mono"
                        onClick={() => setStack((s) => [...s, voucher.reverses_voucher_id as string])}
                      >
                        {voucher.reverses_voucher_no || "Open original voucher"}
                      </Button>
                    </MetaItem>
                  ) : null}
                  <MetaItem label="Source document" className="sm:col-span-2">
                    {reference?.kind === "none" && !voucher.reference_id ? (
                      <span className="font-normal text-muted-foreground">{reference.label}</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {reference?.label}
                        </span>
                        {voucher.reference_id && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 font-mono text-xs font-normal text-muted-foreground">
                            <Hash className="h-3 w-3" aria-hidden />
                            <span title={voucher.reference_id}>{shortId(voucher.reference_id)}</span>
                            <CopyButton value={voucher.reference_id} label="Copy reference id" />
                          </span>
                        )}
                        {reference?.kind === "voucher" && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() => setStack((s) => [...s, reference.voucherId])}
                          >
                            Open original voucher
                          </Button>
                        )}
                        {reference?.kind === "page" && (
                          <Button variant="link" size="sm" className="h-auto p-0" asChild>
                            <Link href={reference.href}>
                              Open {reference.label.toLowerCase()} page
                              <ExternalLink aria-hidden />
                            </Link>
                          </Button>
                        )}
                      </div>
                    )}
                    {reference?.kind === "page" && (
                      <p className="mt-1 text-xs font-normal text-muted-foreground">
                        That page has no direct link to a single record yet — use the reference id to find it.
                      </p>
                    )}
                  </MetaItem>
                </dl>

                <section aria-labelledby="voucher-narration">
                  <h3 id="voucher-narration" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Narration
                  </h3>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-lg border px-3 py-2.5 text-sm">
                    {voucher.narration || <span className="text-muted-foreground">No narration recorded.</span>}
                  </p>
                </section>

                <section aria-labelledby="voucher-lines" className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="voucher-lines" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Lines <span className="font-normal normal-case">({lines.length})</span>
                    </h3>
                    <BalanceStatus balanced={totals.balanced} difference={totals.debit - totals.credit} className="text-xs" />
                  </div>
                  <ScrollTable maxHeight="max-h-[45vh]" label="Voucher lines">
                    <TableHeader className={stickyHeaderClass}>
                      <TableRow>
                        <TableHead className="w-8 text-right">#</TableHead>
                        <TableHead className="min-w-[180px]">Account</TableHead>
                        <TableHead className="min-w-[120px]">Memo</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                            This voucher has no lines.
                          </TableCell>
                        </TableRow>
                      ) : (
                        lines.map((l, i) => (
                          <TableRow key={l.id}>
                            <TableCell className="num text-right text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>
                              <span className="num mr-1.5 font-mono text-xs text-muted-foreground">
                                {l.accounting_accounts?.code ?? "—"}
                              </span>
                              <span className="font-medium">{l.accounting_accounts?.name ?? "Unknown account"}</span>
                            </TableCell>
                            <TableCell className="max-w-[220px] text-muted-foreground">
                              <span className="line-clamp-2" title={l.description ?? undefined}>
                                {l.description || "—"}
                              </span>
                            </TableCell>
                            <MoneyCell value={l.debit_amount} blankZero />
                            <MoneyCell value={l.credit_amount} blankZero />
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow className={totalsRowClass}>
                        <TableCell colSpan={3}>Total</TableCell>
                        <MoneyCell value={totals.debit} strong />
                        <MoneyCell value={totals.credit} strong />
                      </TableRow>
                    </TableFooter>
                  </ScrollTable>
                  <p className="text-right text-xs text-muted-foreground">
                    Voucher amount <span className="num font-semibold text-foreground">{money(Math.max(totals.debit, totals.credit))}</span>
                  </p>
                </section>
              </div>
            ) : null}
          </div>

          {voucher && caps && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-5 py-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handlePrint()} loading={printing} loadingText="Preparing…">
                  {!printing && <Printer aria-hidden />}
                  Print
                </Button>
                {caps.canEdit && onEditDraft && (
                  <Button variant="outline" onClick={() => onEditDraft(voucher)}>
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                )}
                {caps.canPost && (
                  <Button onClick={() => actions.request("post", voucher)}>
                    <Send aria-hidden />
                    Post
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {caps.canDelete && (
                  <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => actions.request("delete", voucher)}>
                    <Trash2 aria-hidden />
                    Delete draft
                  </Button>
                )}
                {caps.canVoid && (
                  <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => actions.request("void", voucher)}>
                    <Ban aria-hidden />
                    Void
                  </Button>
                )}
                {caps.canReverse && (
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => actions.request("reverse", voucher)}>
                    <RotateCcw aria-hidden />
                    Reverse
                  </Button>
                )}
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
          {!voucher && !isLoading && !error && (
            <div className="border-t px-5 py-3 text-sm text-muted-foreground">
              <FilePen className="mr-1 inline h-4 w-4" aria-hidden />
              Select a voucher to see its details.
            </div>
          )}
        </SheetContent>
      </Sheet>
      {actions.element}
    </>
  )
}
