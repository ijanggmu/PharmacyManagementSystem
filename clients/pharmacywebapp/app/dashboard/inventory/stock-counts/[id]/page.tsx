"use client"

import { useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardCheck, Download, PackagePlus, Printer, ScanLine } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { formatNepalDateTime } from "@/lib/utils/nepal-time"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { downloadCsv } from "@/features/accounting/lib/csv"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { medicinesApi } from "@/features/medicines/api-client"
import { stockCountKeys, stockCountsApi, type StockCountEntry, type StockCountTransition } from "@/features/stock-counts/api-client"
import { AddFoundLotDialog } from "@/features/stock-counts/components/add-found-lot-dialog"
import {
  VARIANCE_CSV_HEADERS,
  buildCountSheetHtml,
  canCancel,
  filterLines,
  parseCountInput,
  stockCountStatusLabel,
  stockCountStatusVariant,
  varianceCsvRows,
  varianceSummary,
  type StockCountLine,
} from "@/features/stock-counts/lib/stock-count"

/**
 * One stock count: the counting screen (scan or search a lot, type what's on the shelf), the variance review,
 * and posting. Counts save as each figure is entered.
 */
export default function StockCountDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const { profile } = usePharmacyProfile()
  const { branches } = useBranchAccess()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [matchedMedicineIds, setMatchedMedicineIds] = useState<string[] | null>(null)
  const [onlyVariances, setOnlyVariances] = useState(false)
  const [blind, setBlind] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [confirmPost, setConfirmPost] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [foundLotMedicine, setFoundLotMedicine] = useState<{ id: string; name: string } | null | undefined>(undefined)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const postKeys = useRef(createIdempotencyKeyTracker())

  const detail = useQuery({ queryKey: stockCountKeys.detail(id), queryFn: () => stockCountsApi.get(id) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: stockCountKeys.all })
  const fail = (title: string) => (error: unknown) =>
    toast({ title, description: stockErrorMessage(error, "Try again."), variant: "destructive" })

  const record = useMutation({
    mutationFn: (entries: StockCountEntry[]) => stockCountsApi.record(id, entries),
    onSuccess: (_ids, entries) => {
      setDrafts((d) => {
        const next = { ...d }
        for (const entry of entries) if (entry.lineId) delete next[entry.lineId]
        return next
      })
      void refresh()
    },
    onError: fail("Couldn't save the count"),
  })
  const start = useMutation({ mutationFn: () => stockCountsApi.start(id), onSuccess: () => void refresh(), onError: fail("Couldn't start counting") })
  const transition = useMutation({
    mutationFn: (to: StockCountTransition) => stockCountsApi.transition(id, to),
    onSuccess: () => {
      setConfirmCancel(false)
      void refresh()
    },
    onError: fail("Couldn't change the count"),
  })
  const post = useMutation({
    mutationFn: (key: string) => stockCountsApi.post(id, key),
    onSuccess: (session) => {
      postKeys.current.reset()
      setConfirmPost(false)
      toast({
        title: "Stock count posted",
        description: `Gain ${formatCurrency(session.postedGainValue)}, loss ${formatCurrency(session.postedLossValue)} posted to stock and the books.`,
      })
      void refresh()
    },
    onError: fail("Couldn't post the count"),
  })

  const data = detail.data
  const session = data?.session
  const counting = session?.status === "Counting"
  const lines = useMemo(() => data?.lines ?? [], [data])
  const summary = useMemo(() => varianceSummary(lines), [lines])
  const visible = useMemo(() => {
    let rows = matchedMedicineIds ? lines.filter((l) => matchedMedicineIds.includes(l.medicineId)) : filterLines(lines, search)
    if (onlyVariances) rows = rows.filter((l) => (l.varianceQuantity ?? 0) !== 0)
    return rows
  }, [lines, search, matchedMedicineIds, onlyVariances])
  const hideSystem = counting && blind

  const saveLine = (line: StockCountLine) => {
    const raw = drafts[line.id]
    if (raw === undefined) return
    const value = parseCountInput(raw)
    if (value === undefined) {
      toast({ title: "Not a quantity", description: `Enter a number for ${line.medicineName} (${line.batchNo}).`, variant: "destructive" })
      return
    }
    if (value === line.countedQuantity) {
      setDrafts((d) => {
        const next = { ...d }
        delete next[line.id]
        return next
      })
      return
    }
    record.mutate([{ lineId: line.id, countedQuantity: value }])
  }

  /** Enter in the scan box: jump to the one matching lot; else look the code up as a medicine (barcode). */
  const onScan = async () => {
    const term = search.trim()
    if (!term) return
    const direct = filterLines(lines, term)
    if (direct.length === 1) {
      inputs.current.get(direct[0].id)?.focus()
      return
    }
    if (direct.length > 1) return
    const { data: medicines } = await medicinesApi.getMedicines({ search: term, limit: 5 })
    const ids = medicines.map((m) => m.id)
    const onSheet = lines.filter((l) => ids.includes(l.medicineId))
    if (onSheet.length > 0) {
      setMatchedMedicineIds(ids)
      if (onSheet.length === 1) setTimeout(() => inputs.current.get(onSheet[0].id)?.focus(), 0)
      return
    }
    if (medicines.length > 0 && counting) {
      const m = medicines[0]
      setFoundLotMedicine({ id: m.id, name: [m.name, m.strength].filter(Boolean).join(" ") })
      return
    }
    toast({ title: "Nothing matches", description: `No lot or medicine matches “${term}”.` })
  }

  const printSheet = () => {
    if (!data) return
    void printHtmlDocument(
      buildCountSheetHtml({
        session: data.session,
        lines: data.lines,
        profile,
        branchName: branches.find((b) => b.id === data.session.branchId)?.name ?? null,
        blind: counting ? blind : false,
      }),
    )
  }

  const exportCsv = () => {
    if (!data) return
    downloadCsv(`${data.session.sessionNumber}-variances.csv`, VARIANCE_CSV_HEADERS, varianceCsvRows(data.lines))
  }

  if (detail.isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState text="Loading the count" />
        </PageContainer>
      </DashboardLayout>
    )
  }

  if (detail.isError || !data || !session) {
    return (
      <DashboardLayout>
        <PageContainer>
          <ErrorState
            message={stockErrorMessage(detail.error, "This stock count couldn't be loaded.")}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title={session.title}
          description={`${session.sessionNumber}${session.rackLocation ? ` · Rack ${session.rackLocation}` : ""}${
            session.snapshotAtUtc ? ` · Snapshot ${formatNepalDateTime(session.snapshotAtUtc)}` : ""
          }`}
          icon={ClipboardCheck}
          backHref="/dashboard/inventory/stock-counts"
          backLabel="Stock counts"
          badge={<Badge variant={stockCountStatusVariant(session.status)}>{stockCountStatusLabel(session.status)}</Badge>}
          actions={
            <div className="flex flex-wrap gap-2">
              {session.status !== "Draft" && (
                <Button variant="outline" onClick={printSheet}>
                  <Printer className="mr-1 h-4 w-4" /> Count sheet
                </Button>
              )}
              {(session.status === "Review" || session.status === "Posted") && (
                <Button variant="outline" onClick={exportCsv}>
                  <Download className="mr-1 h-4 w-4" /> Variances CSV
                </Button>
              )}
              {session.status === "Draft" && (
                <Button onClick={() => start.mutate()} loading={start.isPending} loadingText="Starting…">
                  Start counting
                </Button>
              )}
              {counting && (
                <Button onClick={() => transition.mutate("SubmitForReview")} loading={transition.isPending} loadingText="Submitting…">
                  Finish counting
                </Button>
              )}
              {session.status === "Review" && (
                <>
                  <Button variant="outline" onClick={() => transition.mutate("Reopen")} disabled={transition.isPending}>
                    Back to counting
                  </Button>
                  <Button onClick={() => setConfirmPost(true)}>Post variances</Button>
                </>
              )}
              {canCancel(session.status) && (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                  Cancel count
                </Button>
              )}
            </div>
          }
        />

        <Section spacing="lg">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Lots counted" value={`${summary.counted} / ${summary.total}`} />
            <Stat label="With a difference" value={String(summary.withVariance)} />
            <Stat label="Stock gained" value={hideSystem ? "Hidden" : formatCurrency(summary.gainValue)} />
            <Stat label="Stock missing" value={hideSystem ? "Hidden" : formatCurrency(summary.lossValue)} tone={summary.lossValue > 0 ? "danger" : undefined} />
          </div>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <ScanLine className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    className="pl-8"
                    placeholder="Scan a barcode or search medicine, batch or rack — Enter jumps to the lot"
                    aria-label="Scan or search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setMatchedMedicineIds(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void onScan()
                      }
                    }}
                  />
                </div>
                {counting && (
                  <div className="flex items-center gap-2">
                    <Switch id="blind" checked={blind} onCheckedChange={setBlind} />
                    <Label htmlFor="blind">Blind count (hide system quantities)</Label>
                  </div>
                )}
                {!counting && session.status !== "Draft" && (
                  <div className="flex items-center gap-2">
                    <Switch id="only-variances" checked={onlyVariances} onCheckedChange={setOnlyVariances} />
                    <Label htmlFor="only-variances">Only lots with a difference</Label>
                  </div>
                )}
                {counting && (
                  <Button variant="outline" onClick={() => setFoundLotMedicine(null)}>
                    <PackagePlus className="mr-1 h-4 w-4" /> Found a lot
                  </Button>
                )}
              </div>

              {session.status === "Draft" ? (
                <p className="text-sm text-muted-foreground">
                  Start counting to record what the system holds for each lot in scope. Print the count sheet after that.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rack</TableHead>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        {!hideSystem && <TableHead className="text-right">Expected</TableHead>}
                        <TableHead className="w-32 text-right">Counted</TableHead>
                        {!hideSystem && <TableHead className="text-right">Difference</TableHead>}
                        {!hideSystem && <TableHead className="text-right">Value</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                            No lots match.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visible.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="whitespace-nowrap">{line.rackLocation ?? "—"}</TableCell>
                            <TableCell>
                              <div className="font-medium">{line.medicineName}</div>
                              {line.isFoundLot && <Badge variant="info">Found lot</Badge>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{line.batchNo}</TableCell>
                            <TableCell className="whitespace-nowrap">{line.expiryDate ?? "—"}</TableCell>
                            {!hideSystem && (
                              <TableCell className="num text-right" title={`Snapshot ${line.snapshotQuantity}, movements since ${line.movementsSinceSnapshot}`}>
                                {line.expectedQuantity ?? line.snapshotQuantity + line.movementsSinceSnapshot}
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              {counting ? (
                                <Input
                                  ref={(el) => {
                                    if (el) inputs.current.set(line.id, el)
                                    else inputs.current.delete(line.id)
                                  }}
                                  inputMode="decimal"
                                  aria-label={`Counted quantity for ${line.medicineName} ${line.batchNo}`}
                                  className="num h-8 text-right"
                                  value={drafts[line.id] ?? (line.countedQuantity === null ? "" : String(line.countedQuantity))}
                                  onChange={(e) => setDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                                  onBlur={() => saveLine(line)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault()
                                      saveLine(line)
                                    }
                                  }}
                                />
                              ) : (
                                <span className="num">{line.countedQuantity ?? "—"}</span>
                              )}
                            </TableCell>
                            {!hideSystem && (
                              <TableCell
                                className={cn(
                                  "num text-right",
                                  (line.varianceQuantity ?? 0) < 0 && "text-destructive",
                                  (line.varianceQuantity ?? 0) > 0 && "text-success",
                                )}
                              >
                                {line.varianceQuantity === null ? "—" : line.varianceQuantity > 0 ? `+${line.varianceQuantity}` : line.varianceQuantity}
                              </TableCell>
                            )}
                            {!hideSystem && (
                              <TableCell className="num text-right">
                                {line.varianceValue === null ? "—" : formatCurrency(line.varianceValue)}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
              {session.status === "Review" && summary.uncounted > 0 && (
                <p className="text-sm text-muted-foreground">
                  {summary.uncounted} lot{summary.uncounted === 1 ? " was" : "s were"} not counted and will be left as they are.
                </p>
              )}
            </CardContent>
          </Card>
        </Section>

        <ConfirmDialog
          isOpen={confirmPost}
          onClose={() => !post.isPending && setConfirmPost(false)}
          onConfirm={() => post.mutate(postKeys.current.keyFor(`post:${id}`))}
          title="Post this stock count?"
          description={`Lots are set to what was counted (allowing for sales since). ${formatCurrency(summary.gainValue)} of stock gained and ${formatCurrency(summary.lossValue)} missing will be posted to the books. This can't be undone.`}
          confirmText="Post variances"
          loading={post.isPending}
        />
        <ConfirmDialog
          isOpen={confirmCancel}
          onClose={() => !transition.isPending && setConfirmCancel(false)}
          onConfirm={() => transition.mutate("Cancel")}
          title="Cancel this stock count?"
          description="Counts entered so far are kept for reference but nothing is posted. Stock stays as it is."
          confirmText="Cancel count"
          variant="destructive"
          loading={transition.isPending}
        />
        {foundLotMedicine !== undefined && (
          <AddFoundLotDialog
            initialMedicine={foundLotMedicine}
            saving={record.isPending}
            onClose={() => setFoundLotMedicine(undefined)}
            onSave={(entry) => record.mutate([entry], { onSuccess: () => setFoundLotMedicine(undefined) })}
          />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("num mt-1 text-lg font-semibold", tone === "danger" && "text-destructive")}>{value}</div>
      </CardContent>
    </Card>
  )
}
