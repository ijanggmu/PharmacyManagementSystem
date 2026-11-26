"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Section } from "@/components/layouts"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Ban, CalendarX, FileWarning, PackageCheck, ShieldAlert, Wallet } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import {
  WRITE_OFF_REASONS,
  expiredBatchesApi,
  type ExpiredBatch,
  type WriteOffReason,
} from "@/features/inventory/api-client-expired-batches"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { RecallBatchDialog } from "@/features/inventory/components/recall-batch-dialog"
import { useAllowed } from "@/lib/hooks/use-has-permission"
import {
  bulkWriteOffTargets,
  expiredCountLabel,
  expiredRowBadges,
  expiryHref,
  isOnOpenClaim,
  recallFilterParam,
  type RecallFilter,
} from "@/features/inventory/lib/expiry-area"

/**
 * The .NET `/inventory/reports/expired-batches` endpoint now pages for real
 * (`PagedResponse<ExpiredBatchDto>`), so each page turn requests only that page from the server
 * instead of fetching the whole list and slicing it in the browser.
 */
const PAGE_SIZE = 10

/** Stock > Expiry > Expired: lots past expiry (and recalled lots) waiting to be written off. */
export function ExpiredStockPanel() {
  const [batches, setBatches] = useState<ExpiredBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [disposeTarget, setDisposeTarget] = useState<ExpiredBatch | null>(null)
  const [reason, setReason] = useState("")
  const [category, setCategory] = useState<WriteOffReason>("Expired")
  const [disposing, setDisposing] = useState(false)
  const [recallFilter, setRecallFilter] = useState<RecallFilter>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalValue, setTotalValue] = useState(0)
  const [recallOpen, setRecallOpen] = useState(false)
  // "Write off all expired": every expired (not recalled) batch for the branch filter, confirmed once.
  const [bulkTargets, setBulkTargets] = useState<ExpiredBatch[] | null>(null)
  const [bulkDisposing, setBulkDisposing] = useState(false)
  const [bulkDone, setBulkDone] = useState(0)
  const [bulkSkippedOnClaim, setBulkSkippedOnClaim] = useState(0)
  const { toast } = useToast()
  // The API gates write-off on Batches.Dispose and recall on Medicines.Update, not on the report view.
  const { allowed: canDispose } = useAllowed("batches:dispose")
  const { allowed: canRecall } = useAllowed("batches:recall")
  const { allowed: canSeeClaims } = useAllowed("expiry_claims:read")
  // Only the newest request may write state: switching filters quickly must not let a slower
  // response for the previous filter overwrite the current one.
  // ViewAll users can narrow to one branch; the Branch column names each batch's branch.
  const branchFilter = useBranchFilter()
  const branchId = branchFilter.branchId
  const listSeq = useRef(0)
  const totalSeq = useRef(0)
  /** One Idempotency-Key per disposal, reused when the same disposal is retried. */
  const disposeKeys = useRef(createIdempotencyKeyTracker())

  const load = async (filter: RecallFilter = recallFilter, page: number = currentPage) => {
    const seq = ++listSeq.current
    setIsLoading(true)
    setLoadError(null)
    try {
      const isRecalled = recallFilterParam(filter)
      let res = await expiredBatchesApi.list(isRecalled, page, PAGE_SIZE, branchId)
      // Writing off the last row of the last page leaves that page empty: step back to the new last page.
      if (!res.error && res.data.length === 0 && page > 1 && res.totalPages >= 1 && page > res.totalPages) {
        res = await expiredBatchesApi.list(isRecalled, res.totalPages, PAGE_SIZE, branchId)
      }
      if (seq !== listSeq.current) return
      setBatches(res.data)
      setTotalItems(res.totalCount)
      setTotalPages(Math.max(1, res.totalPages))
      setCurrentPage(res.pageNumber)
      if (res.error) {
        setLoadError(res.error)
        toast({ title: "Failed to load expired stock", description: res.error, variant: "destructive" })
      }
    } catch (error) {
      if (seq !== listSeq.current) return
      setLoadError(apiRequestErrorMessage(error))
      toast({ title: "Failed to load expired stock", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      if (seq === listSeq.current) setIsLoading(false)
    }
  }

  // "Value at cost" is a sum across every expired batch for the filter, not just the visible page, so
  // it comes from a separate full-list fetch (walks every page internally) rather than the page's own
  // fetch above.
  const loadTotalValue = async (filter: RecallFilter) => {
    const isRecalled = recallFilterParam(filter)
    const seq = ++totalSeq.current
    const res = await expiredBatchesApi.listAll(isRecalled, branchId)
    if (seq !== totalSeq.current) return
    setTotalValue(res.data.reduce((sum, b) => sum + b.quantity_remaining * Number(b.medicines?.cost_price ?? 0), 0))
  }

  useEffect(() => {
    void load(recallFilter, 1)
    void loadTotalValue(recallFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  const handleFilterChange = (filter: RecallFilter) => {
    setRecallFilter(filter)
    void load(filter, 1)
    void loadTotalValue(filter)
  }

  const handlePageChange = (page: number) => {
    void load(recallFilter, page)
  }

  const handleDispose = async () => {
    if (!disposeTarget || isOnOpenClaim(disposeTarget)) return
    setDisposing(true)
    try {
      const disposeReason = reason.trim() || (category === "Expired" ? "Expired — routine disposal" : category)
      const { error } = await expiredBatchesApi.dispose(
        disposeTarget.id,
        disposeReason,
        disposeKeys.current.keyFor(`dispose:${disposeTarget.id}:${category}:${disposeReason}`),
        category,
      )
      if (error) throw new Error(error)
      disposeKeys.current.reset()
      toast({ title: "Batch disposed", description: "Stock and accounting were written off." })
      setDisposeTarget(null)
      setReason("")
      await Promise.all([load(recallFilter, currentPage), loadTotalValue(recallFilter)])
    } catch (error) {
      toast({ title: "Failed to dispose batch", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setDisposing(false)
    }
  }

  /**
   * Loads every expired, not-recalled batch (all pages) and asks once before writing them all off. Lots on an open
   * supplier claim are left out: the supplier may still take them back (the API refuses to write them off).
   */
  const openBulkDispose = async () => {
    const res = await expiredBatchesApi.listAll(false, branchId)
    if (res.error) {
      toast({ title: "Couldn't load expired stock", description: res.error, variant: "destructive" })
      return
    }
    const { targets, skippedOnClaim } = bulkWriteOffTargets(res.data)
    setBulkSkippedOnClaim(skippedOnClaim)
    if (targets.length === 0) {
      toast({
        title: "Nothing to write off",
        description:
          skippedOnClaim > 0
            ? `${skippedOnClaim} expired batch${skippedOnClaim === 1 ? " is" : "es are"} on an open supplier claim and wait for the supplier's answer.`
            : "No expired batches (recalled lots are written off one by one).",
      })
      return
    }
    setBulkDone(0)
    setBulkTargets(targets)
  }

  /** Disposes the confirmed batches one after another, each with its own idempotency key; reports any that failed. */
  const handleBulkDispose = async () => {
    if (!bulkTargets) return
    setBulkDisposing(true)
    const failed: string[] = []
    for (const b of bulkTargets) {
      const { error } = await expiredBatchesApi.dispose(
        b.id,
        "Expired — routine disposal",
        disposeKeys.current.keyFor(`dispose:${b.id}:Expired:bulk`),
        "Expired",
      )
      if (error) failed.push(`${b.medicines?.name ?? "Medicine"} ${b.batch_number}: ${error}`)
      else disposeKeys.current.reset()
      setBulkDone((n) => n + 1)
    }
    setBulkDisposing(false)
    setBulkTargets(null)
    const written = bulkTargets.length - failed.length
    toast(
      failed.length === 0
        ? { title: `${written} batch${written === 1 ? "" : "es"} written off`, description: "Stock and accounting were written off." }
        : {
            title: `${written} written off, ${failed.length} failed`,
            description: failed.slice(0, 3).join(" · "),
            variant: "destructive",
          },
    )
    await Promise.all([load(recallFilter, 1), loadTotalValue(recallFilter)])
  }

  const bulkValue = (bulkTargets ?? []).reduce((sum, b) => sum + b.quantity_remaining * Number(b.medicines?.cost_price ?? 0), 0)

  const targetValue = (disposeTarget?.quantity_remaining ?? 0) * Number(disposeTarget?.medicines?.cost_price ?? 0)

  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * PAGE_SIZE
  const paginatedBatches = batches

  return (
    <>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <BranchFilterSelect filter={branchFilter} id="expired-branch" hideLabel />
          {canSeeClaims && (
            <Button asChild variant="outline">
              <Link href={expiryHref("claims")}>
                <FileWarning aria-hidden />
                Supplier claims
              </Link>
            </Button>
          )}
          {canRecall && (
            <Button onClick={() => setRecallOpen(true)}>
              <Ban aria-hidden />
              Recall batch
            </Button>
          )}
        </div>

        <RecallBatchDialog
          open={recallOpen}
          onOpenChange={setRecallOpen}
          onRecalled={() => Promise.all([load(recallFilter, 1), loadTotalValue(recallFilter)]).then(() => undefined)}
        />

        <Section spacing="lg">
          <StatGrid cols={2} className="max-w-2xl">
            <StatCard
              label={expiredCountLabel(recallFilter)}
              value={totalItems.toLocaleString()}
              hint={recallFilter === "recalled-only" ? "Blocked from sale until written off" : "Waiting to be written off"}
              icon={CalendarX}
              tone={totalItems > 0 ? "danger" : "success"}
              loading={isLoading}
            />
            <StatCard
              label="Value at cost"
              value={<CurrencyDisplay amount={totalValue} />}
              hint="Loss posted when written off"
              icon={Wallet}
              tone={totalValue > 0 ? "warning" : "default"}
              loading={isLoading}
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle>Batches to write off</CardTitle>
              <CardDescription>
                Disposing a batch removes it from stock permanently and posts the loss to accounting.
                Recalled lots keep their stock (no write-off) but are blocked from sale — filter them out
                separately from an ordinary expiry below. A lot on an open supplier claim can&apos;t be written off
                until the supplier answers.
              </CardDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                {([
                  { key: "all", label: "All" },
                  { key: "expired-only", label: "Expired only" },
                  { key: "recalled-only", label: "Recalled only" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    size="sm"
                    variant={recallFilter === opt.key ? "default" : "outline"}
                    onClick={() => handleFilterChange(opt.key)}
                  >
                    {opt.label}
                  </Button>
                ))}
                {/* Bulk write-off covers expired, not-recalled lots only, so it has no place under "Recalled only". */}
                {canDispose && recallFilter !== "recalled-only" && totalItems > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void openBulkDispose()}
                  >
                    <Ban aria-hidden />
                    Write off all expired
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <SkeletonTable rows={4} cols={7} />
              ) : loadError ? (
                <ErrorState
                  size="compact"
                  title="Couldn't load expired stock"
                  message={`${loadError} Check your connection and try again.`}
                  onRetry={() => void load()}
                />
              ) : batches.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={PackageCheck}
                  title={recallFilter === "recalled-only" ? "No recalled stock on hand" : "No expired stock to write off"}
                  description="Batches appear here once they pass their expiry date or are recalled. Check stock expiring soon to sell or claim it in time."
                  action={{ label: "View expiring soon", href: expiryHref("expiring") }}
                />
              ) : (
                <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch no.</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Expired on</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value at cost</TableHead>
                        <TableHead className="w-56 text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedBatches.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell
                            className="max-w-[220px] truncate font-medium"
                            title={b.medicines?.name || undefined}
                          >
                            {b.medicines?.name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                          <TableCell className="whitespace-nowrap">{branchFilter.branchName(b.branch_id)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="num">{b.expiry_date}</span>
                              {expiredRowBadges(b).map((badge) =>
                                badge === "expired" ? (
                                  <Badge key={badge} variant="danger">
                                    <CalendarX aria-hidden />
                                    Expired
                                  </Badge>
                                ) : badge === "recalled" ? (
                                  <Badge key={badge} variant="warning">
                                    <ShieldAlert aria-hidden />
                                    Recalled
                                  </Badge>
                                ) : (
                                  <Badge key={badge} variant="secondary" title={`${b.open_claim_quantity} units on an open supplier claim`}>
                                    <FileWarning aria-hidden />
                                    On claim
                                  </Badge>
                                ),
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="num text-right">{b.quantity_remaining}</TableCell>
                          <TableCell className="num text-right">
                            <CurrencyDisplay amount={b.quantity_remaining * Number(b.medicines?.cost_price ?? 0)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {canSeeClaims && (
                                <Button asChild variant="ghost" size="sm">
                                  <Link
                                    href={expiryHref("claims")}
                                    aria-label={`Claim batch ${b.batch_number} of ${b.medicines?.name ?? "medicine"} from the supplier`}
                                  >
                                    <FileWarning aria-hidden />
                                    {isOnOpenClaim(b) ? "View claim" : "Claim from supplier"}
                                  </Link>
                                </Button>
                              )}
                              {canDispose && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Dispose batch ${b.batch_number} of ${b.medicines?.name ?? "medicine"}`}
                                  disabled={isOnOpenClaim(b)}
                                  title={isOnOpenClaim(b) ? "On an open supplier claim: wait for the supplier's answer, or reject the claim, first" : undefined}
                                  onClick={() => {
                                    setDisposeTarget(b)
                                    setReason("")
                                    setCategory(b.is_recalled ? "Recalled" : "Expired")
                                  }}
                                >
                                  <Ban aria-hidden />
                                  Dispose
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={PAGE_SIZE}
                  startIndex={startIndex}
                  onPageChange={handlePageChange}
                  className="mt-4"
                />
                </>
              )}
            </CardContent>
          </Card>
        </Section>

        <Dialog open={!!bulkTargets} onOpenChange={(open) => !open && !bulkDisposing && setBulkTargets(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-destructive" aria-hidden />
                Write off all expired batches?
              </DialogTitle>
              <DialogDescription>
                Every expired batch{branchId ? " at this branch" : ""} is written off permanently. Recalled lots are left
                for you to dispose one by one. This cannot be undone.
                {bulkSkippedOnClaim > 0 &&
                  ` ${bulkSkippedOnClaim} batch${bulkSkippedOnClaim === 1 ? " is" : "es are"} on an open supplier claim and left out.`}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Batches</dt>
                <dd className="num">{bulkTargets?.length ?? 0}</dd>
                <dt className="text-muted-foreground">Write-off value</dt>
                <dd className="num font-medium text-destructive">
                  <CurrencyDisplay amount={bulkValue} />
                </dd>
                <dt className="text-muted-foreground">Recorded as</dt>
                <dd>Expired — routine disposal</dd>
              </dl>
              {bulkDisposing && (
                <p className="mt-2 text-muted-foreground" role="status">
                  Writing off {bulkDone} of {bulkTargets?.length ?? 0}…
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkTargets(null)} disabled={bulkDisposing}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBulkDispose} loading={bulkDisposing} loadingText="Writing off…">
                {!bulkDisposing && <Ban aria-hidden />}
                Write off {bulkTargets?.length ?? 0} batches
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!disposeTarget} onOpenChange={(open) => !open && !disposing && setDisposeTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-destructive" aria-hidden />
                Dispose {disposeTarget?.medicines?.name}?
              </DialogTitle>
              <DialogDescription>This permanently writes off the batch and cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Batch no.</dt>
                  <dd className="font-mono">{disposeTarget?.batch_number}</dd>
                  <dt className="text-muted-foreground">Units removed</dt>
                  <dd className="num">{disposeTarget?.quantity_remaining}</dd>
                  <dt className="text-muted-foreground">Write-off value</dt>
                  <dd className="num font-medium text-destructive">
                    <CurrencyDisplay amount={targetValue} />
                  </dd>
                </dl>
                <p className="mt-2 text-muted-foreground">
                  Stock is zeroed, the batch is removed from sale, and a write-off is posted to accounting.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dispose-category">Write-off reason</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as WriteOffReason)}>
                  <SelectTrigger id="dispose-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WRITE_OFF_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dispose-reason">Details (optional)</Label>
                <Textarea
                  id="dispose-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. routine expiry disposal"
                  rows={2}
                  aria-describedby="dispose-reason-hint"
                />
                <p id="dispose-reason-hint" className="text-xs text-muted-foreground">
                  Saved with the write-off for audit. Left blank, it is recorded as &ldquo;Expired — routine disposal&rdquo;.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => setDisposeTarget(null)} disabled={disposing}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDispose} loading={disposing} loadingText="Disposing…">
                {!disposing && <Ban aria-hidden />}
                Dispose batch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  )
}
