"use client"

import { useMemo, useRef, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, FileWarning, Printer } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { businessDateInstantUtc, formatNepalDateTime, nepalYmdOf } from "@/lib/utils/nepal-time"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { suppliersApi } from "@/features/suppliers/api-client"
import { usePrintDebitNote } from "@/features/returns/hooks/use-print-debit-note"
import {
  expiryClaimKeys,
  expiryClaimsApi,
  type AcceptExpiryClaimInput,
  type ExpiryClaimListFilters,
  type ExpiryClaimStatusAction,
} from "@/features/expiry-claims/api-client"
import {
  EXPIRY_CLAIM_STATUSES,
  acceptanceSummary,
  attributionLabel,
  buildClaimLetterHtml,
  claimActions,
  claimStatusVariant,
  expiryLabel,
  fullAcceptance,
  selectionToLines,
  selectionValue,
  type ExpiryClaim,
  type ExpiryClaimCandidateGroup,
} from "@/features/expiry-claims/lib/expiry-claim"

const PAGE_SIZE = 20
const WINDOWS = [30, 60, 90, 180]

/**
 * Purchasing → Expiry claims: near-expiry and expired lots grouped by the supplier that delivered them, claims
 * to those suppliers, and their answer. An accepted claim (in full or in part) sends the accepted units back on
 * an ordinary debit note with reason "Expiry".
 */
export default function ExpiryClaimsPage() {
  const [tab, setTab] = useState<"candidates" | "claims">("candidates")
  const [openClaimId, setOpenClaimId] = useState<string | null>(null)

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Expiry claims"
          description="Claim expired and near-expiry stock back from the suppliers that delivered it."
          icon={FileWarning}
        />
        <Section spacing="lg">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="candidates">Lots to claim</TabsTrigger>
              <TabsTrigger value="claims">Claims</TabsTrigger>
            </TabsList>
            <TabsContent value="candidates">
              <CandidatesTab
                onCreated={(id) => {
                  setTab("claims")
                  setOpenClaimId(id)
                }}
              />
            </TabsContent>
            <TabsContent value="claims">
              <ClaimsTab onOpen={setOpenClaimId} />
            </TabsContent>
          </Tabs>
        </Section>
        {openClaimId && <ClaimDialog claimId={openClaimId} onClose={() => setOpenClaimId(null)} />}
      </PageContainer>
    </DashboardLayout>
  )
}

interface CreateArgs {
  supplierId: string
  lines: { batchId: string; quantity: number }[]
  notes: string | null
  key: string
}

function CandidatesTab({ onCreated }: { onCreated: (claimId: string) => void }) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const [withinDays, setWithinDays] = useState(90)
  // Selected quantity per batch, per supplier group (a claim goes to one supplier).
  const [selected, setSelected] = useState<Record<string, Record<string, number>>>({})
  const [notes, setNotes] = useState("")
  const keys = useRef(createIdempotencyKeyTracker())

  const candidates = useQuery({
    queryKey: expiryClaimKeys.candidates(withinDays),
    queryFn: () => expiryClaimsApi.candidates(withinDays),
  })

  const create = useMutation({
    mutationFn: ({ supplierId, lines, notes: n, key }: CreateArgs) => expiryClaimsApi.create({ supplierId, lines, notes: n }, key),
    onSuccess: (id, args) => {
      keys.current.reset()
      setSelected((s) => ({ ...s, [args.supplierId]: {} }))
      setNotes("")
      void queryClient.invalidateQueries({ queryKey: expiryClaimKeys.all })
      toast({ title: "Claim drafted", description: "Print the claim letter and mark it sent once it reaches the supplier." })
      onCreated(id)
    },
    onError: (error) =>
      toast({ title: "Couldn't create the claim", description: stockErrorMessage(error, "Try again."), variant: "destructive" }),
  })

  const groups = candidates.data ?? []

  const toggle = (group: ExpiryClaimCandidateGroup, batchId: string, quantity: number, on: boolean) => {
    if (!group.supplierId) return
    const key = group.supplierId
    setSelected((s) => {
      const current = { ...(s[key] ?? {}) }
      if (on) current[batchId] = quantity
      else delete current[batchId]
      return { ...s, [key]: current }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Lots to claim</CardTitle>
          <CardDescription>Stock at this branch that expires soon or has expired, by the supplier that delivered it. Consigned stock is settled, not claimed.</CardDescription>
        </div>
        <Select value={String(withinDays)} onValueChange={(v) => setWithinDays(Number(v))}>
          <SelectTrigger className="sm:w-52" aria-label="Expiry window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                Expired or expiring in {d} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        {candidates.isLoading ? (
          <LoadingState text="Finding near-expiry stock" />
        ) : candidates.isError ? (
          <ErrorState
            message={stockErrorMessage(candidates.error, "Couldn't load near-expiry stock.")}
            onRetry={() => void candidates.refetch()}
            retrying={candidates.isFetching}
          />
        ) : groups.length === 0 ? (
          <EmptyState icon={CalendarClock} size="compact" title="Nothing to claim" description="No unclaimed stock expires in this window." />
        ) : (
          groups.map((group) => {
            const picked = group.supplierId ? selected[group.supplierId] ?? {} : {}
            const lines = selectionToLines(group.lots, picked)
            return (
              <div key={group.supplierId ?? "unknown"} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{group.supplierName ?? "Supplier unknown"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {group.lots.length} lot{group.lots.length === 1 ? "" : "s"} · {formatCurrency(group.totalValue)} at cost
                      {!group.supplierId && " · no receipt or preferred supplier records who delivered these"}
                    </p>
                  </div>
                  {group.supplierId && (
                    <Button
                      size="sm"
                      disabled={lines.length === 0 || create.isPending}
                      loading={create.isPending}
                      loadingText="Creating…"
                      onClick={() =>
                        create.mutate({
                          supplierId: group.supplierId!,
                          lines,
                          notes: notes.trim() || null,
                          key: keys.current.keyFor(`${group.supplierId}:${JSON.stringify(lines)}`),
                        })
                      }
                    >
                      Claim {lines.length > 0 ? `${lines.length} lot${lines.length === 1 ? "" : "s"} · ${formatCurrency(selectionValue(group.lots, picked))}` : "selected lots"}
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="w-28 text-right">Claim qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.lots.map((lot) => {
                        const isOn = picked[lot.batchId] !== undefined
                        return (
                          <TableRow key={lot.batchId}>
                            <TableCell>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                aria-label={`Claim ${lot.medicineName} ${lot.batchNo}`}
                                disabled={!group.supplierId}
                                checked={isOn}
                                onChange={(e) => toggle(group, lot.batchId, lot.claimableQuantity, e.target.checked)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{lot.medicineName}</TableCell>
                            <TableCell className="font-mono text-xs">{lot.batchNo}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div>{lot.expiryDate}</div>
                              <div className={cn("text-xs", lot.isExpired ? "text-destructive" : "text-warning")}>{expiryLabel(lot)}</div>
                            </TableCell>
                            <TableCell className="num text-right">
                              {lot.quantityOnHand}
                              {lot.alreadyClaimedQuantity > 0 && (
                                <div className="text-xs text-muted-foreground">{lot.alreadyClaimedQuantity} on open claims</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                inputMode="decimal"
                                className="num h-8 text-right"
                                aria-label={`Quantity to claim of ${lot.batchNo}`}
                                disabled={!isOn}
                                value={isOn ? String(picked[lot.batchId]) : String(lot.claimableQuantity)}
                                onChange={(e) => {
                                  const q = Number(e.target.value)
                                  if (Number.isFinite(q)) toggle(group, lot.batchId, Math.min(Math.max(0, q), lot.claimableQuantity), true)
                                }}
                              />
                            </TableCell>
                            <TableCell className="num text-right">{formatCurrency(lot.claimableValue)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{attributionLabel(lot.attribution)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          })
        )}
        {groups.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="claim-notes">Note for the claim letter (optional)</Label>
            <Textarea id="claim-notes" rows={2} maxLength={1024} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClaimsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { formatCurrency } = useCurrency()
  const [filters, setFilters] = useState<ExpiryClaimListFilters>({ page: 1, pageSize: PAGE_SIZE, status: "all" })
  const list = useQuery({
    queryKey: expiryClaimKeys.list(filters),
    queryFn: () => expiryClaimsApi.list(filters),
    placeholderData: keepPreviousData,
  })
  const rows = list.data?.items ?? []
  const page = filters.page ?? 1

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <Select
          value={filters.status ?? "all"}
          onValueChange={(status) => setFilters((f) => ({ ...f, status: status as ExpiryClaimListFilters["status"], page: 1 }))}
        >
          <SelectTrigger className="sm:w-52" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All claims</SelectItem>
            {EXPIRY_CLAIM_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {list.isLoading ? (
          <LoadingState text="Loading claims" />
        ) : list.isError ? (
          <ErrorState message={stockErrorMessage(list.error, "Claims couldn't be loaded.")} onRetry={() => void list.refetch()} retrying={list.isFetching} />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileWarning} size="compact" title="No claims yet" description="Pick lots on the “Lots to claim” tab to draft one." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Claimed</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead>Debit note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => onOpen(c.id)}>
                    <TableCell>
                      <div className="font-mono text-sm">{c.claimNumber}</div>
                      <div className="text-xs text-muted-foreground">{formatNepalDateTime(c.createdAtUtc)}</div>
                    </TableCell>
                    <TableCell>{c.supplierName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={claimStatusVariant(c.status)}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="num text-right">{formatCurrency(c.claimedValue)}</TableCell>
                    <TableCell className="num text-right">{c.status === "Accepted" || c.status === "Credited" ? formatCurrency(c.acceptedValue) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.debitNoteNumber ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {list.data && list.data.totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={list.data.totalPages}
            totalItems={list.data.totalCount}
            itemsPerPage={PAGE_SIZE}
            startIndex={(page - 1) * PAGE_SIZE}
            onPageChange={(next) => setFilters((f) => ({ ...f, page: next }))}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface StatusArgs {
  action: ExpiryClaimStatusAction
  reason?: string | null
  reference?: string | null
}

function ClaimDialog({ claimId, onClose }: { claimId: string; onClose: () => void }) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const { profile } = usePharmacyProfile()
  const { branches } = useBranchAccess()
  const { print: printDebitNote, printingId } = usePrintDebitNote()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<"view" | "accept" | "reject" | "credit">("view")
  const [accepted, setAccepted] = useState<Record<string, number>>({})
  const [returnDate, setReturnDate] = useState(nepalYmdOf())
  const [invoice, setInvoice] = useState("")
  const [reverseVat, setReverseVat] = useState(true)
  const [reason, setReason] = useState("")
  const [creditNote, setCreditNote] = useState("")
  const acceptKeys = useRef(createIdempotencyKeyTracker())

  const claim = useQuery({ queryKey: expiryClaimKeys.detail(claimId), queryFn: () => expiryClaimsApi.get(claimId) })
  const done = (title: string) => {
    setMode("view")
    void queryClient.invalidateQueries({ queryKey: expiryClaimKeys.all })
    toast({ title })
  }
  const fail = (title: string) => (error: unknown) =>
    toast({ title, description: stockErrorMessage(error, "Try again."), variant: "destructive" })

  const status = useMutation({
    mutationFn: ({ action, reason: r, reference }: StatusArgs) => expiryClaimsApi.changeStatus(claimId, action, r, reference),
    onSuccess: (_id, args) =>
      done(args.action === "MarkSent" ? "Claim marked sent" : args.action === "Reject" ? "Claim rejected" : "Claim marked credited"),
    onError: fail("Couldn't update the claim"),
  })
  const accept = useMutation({
    mutationFn: ({ input, key }: { input: AcceptExpiryClaimInput; key: string }) => expiryClaimsApi.accept(claimId, input, key),
    onSuccess: () => {
      acceptKeys.current.reset()
      done("Claim accepted — debit note raised")
    },
    onError: fail("Couldn't accept the claim"),
  })

  const c = claim.data
  const acceptance = useMemo(() => (c ? acceptanceSummary(c.lines, accepted) : null), [c, accepted])

  const printLetter = async (data: ExpiryClaim) => {
    const { data: supplier } = await suppliersApi.getSupplier(data.supplierId)
    await printHtmlDocument(
      buildClaimLetterHtml({
        claim: data,
        profile,
        branchName: branches.find((b) => b.id === data.branchId)?.name ?? null,
        supplier: supplier ? { name: supplier.name, address: supplier.address, phone: supplier.phone, panVat: supplier.tax_id ?? null } : null,
      }),
    )
  }

  const busy = status.isPending || accept.isPending

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "max-h-[90vh] sm:max-w-3xl")}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle className="flex items-center gap-2">
            {c?.claimNumber ?? "Expiry claim"} {c && <Badge variant={claimStatusVariant(c.status)}>{c.status}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {c ? `${c.supplierName ?? "Supplier"} · claimed ${formatCurrency(c.claimedValue)}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        <DialogScrollBody className="py-4">
          {claim.isLoading ? (
            <LoadingState text="Loading the claim" />
          ) : claim.isError || !c ? (
            <ErrorState message={stockErrorMessage(claim.error, "The claim couldn't be loaded.")} onRetry={() => void claim.refetch()} retrying={claim.isFetching} />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Claimed</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="w-28 text-right">Accepted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.medicineName}</TableCell>
                        <TableCell className="font-mono text-xs">{l.batchNo}</TableCell>
                        <TableCell>{l.expiryDate}</TableCell>
                        <TableCell className="num text-right">{l.quantity}</TableCell>
                        <TableCell className="num text-right">{formatCurrency(l.value)}</TableCell>
                        <TableCell className="text-right">
                          {mode === "accept" ? (
                            <Input
                              inputMode="decimal"
                              className="num h-8 text-right"
                              aria-label={`Accepted quantity of ${l.batchNo}`}
                              value={String(accepted[l.id] ?? l.quantity)}
                              onChange={(e) => {
                                const q = Number(e.target.value)
                                setAccepted((a) => ({ ...a, [l.id]: Number.isFinite(q) ? q : -1 }))
                              }}
                            />
                          ) : (
                            <span className="num">{l.acceptedQuantity ?? "—"}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {c.sentAtUtc && <Meta label="Sent" value={formatNepalDateTime(c.sentAtUtc)} />}
                {c.respondedAtUtc && <Meta label="Answered" value={formatNepalDateTime(c.respondedAtUtc)} />}
                {c.debitNoteNumber && <Meta label="Debit note" value={c.debitNoteNumber} />}
                {c.supplierCreditNoteNumber && <Meta label="Supplier credit note" value={c.supplierCreditNoteNumber} />}
                {c.rejectionReason && <Meta label="Rejected because" value={c.rejectionReason} />}
                {c.notes && <Meta label="Notes" value={c.notes} />}
              </dl>

              {mode === "accept" && acceptance && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm">
                    Accepted units go back to the supplier on a debit note (reason “Expiry”) worth{" "}
                    <strong className="num">{formatCurrency(acceptance.value)}</strong> at cost, plus VAT when reversed. Set a line to 0 if the
                    supplier refused it.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="return-date">Return date</Label>
                      <Input id="return-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="return-invoice">Supplier bill no. (optional)</Label>
                      <Input id="return-invoice" maxLength={100} value={invoice} onChange={(e) => setInvoice(e.target.value)} />
                    </div>
                    <div className="flex items-end gap-2 pb-2">
                      <Switch id="reverse-vat" checked={reverseVat} onCheckedChange={setReverseVat} />
                      <Label htmlFor="reverse-vat">Bought on a VAT bill</Label>
                    </div>
                  </div>
                </div>
              )}
              {(mode === "reject" || mode === "credit") && (
                <div className="space-y-1.5">
                  <Label htmlFor="status-text">{mode === "reject" ? "Why did the supplier refuse?" : "Supplier credit note number (optional)"}</Label>
                  {mode === "reject" ? (
                    <Textarea id="status-text" rows={2} maxLength={512} value={reason} onChange={(e) => setReason(e.target.value)} />
                  ) : (
                    <Input id="status-text" maxLength={100} value={creditNote} onChange={(e) => setCreditNote(e.target.value)} />
                  )}
                </div>
              )}
            </div>
          )}
        </DialogScrollBody>

        {c && (
          <DialogStickyFooter className="flex-col-reverse flex-wrap sm:flex-row">
            <Button variant="outline" onClick={() => void printLetter(c)}>
              <Printer className="mr-1 h-4 w-4" /> Claim letter
            </Button>
            {c.supplierReturnId && (
              <Button
                variant="outline"
                onClick={() => void printDebitNote(c.supplierReturnId!)}
                loading={printingId === c.supplierReturnId}
                loadingText="Preparing…"
              >
                <Printer className="mr-1 h-4 w-4" /> Debit note
              </Button>
            )}
            {mode === "view" &&
              claimActions(c.status).map((action) => (
                <Button
                  key={action}
                  variant={action === "reject" ? "ghost" : "default"}
                  disabled={busy}
                  onClick={() => {
                    if (action === "send") status.mutate({ action: "MarkSent" })
                    else if (action === "accept") {
                      setAccepted(fullAcceptance(c.lines))
                      setMode("accept")
                    } else setMode(action)
                  }}
                >
                  {action === "send" ? "Mark sent" : action === "accept" ? "Record acceptance" : action === "reject" ? "Supplier rejected" : "Credit note received"}
                </Button>
              ))}
            {mode !== "view" && (
              <>
                <Button variant="ghost" disabled={busy} onClick={() => setMode("view")}>
                  Back
                </Button>
                {mode === "accept" && acceptance && (
                  <Button
                    disabled={!acceptance.valid || !acceptance.anyAccepted || !returnDate || busy}
                    loading={accept.isPending}
                    loadingText="Raising debit note…"
                    onClick={() => {
                      const input: AcceptExpiryClaimInput = {
                        lines: acceptance.lines,
                        returnDateUtc: businessDateInstantUtc(returnDate),
                        supplierInvoiceNumber: invoice.trim() || null,
                        reverseInputVat: reverseVat,
                      }
                      accept.mutate({ input, key: acceptKeys.current.keyFor(JSON.stringify(input)) })
                    }}
                  >
                    Accept & raise debit note
                  </Button>
                )}
                {mode === "reject" && (
                  <Button
                    variant="destructive"
                    disabled={!reason.trim() || busy}
                    loading={status.isPending}
                    onClick={() => status.mutate({ action: "Reject", reason: reason.trim() })}
                  >
                    Mark rejected
                  </Button>
                )}
                {mode === "credit" && (
                  <Button disabled={busy} loading={status.isPending} onClick={() => status.mutate({ action: "MarkCredited", reference: creditNote.trim() || null })}>
                    Mark credited
                  </Button>
                )}
              </>
            )}
          </DialogStickyFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
