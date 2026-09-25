"use client"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogScrollBody, DialogStickyFooter, DialogTitle, DIALOG_CONTENT_SCROLL_BODY_CLASS } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Ban, Check, Clock, History, MapPin, Package, Pill, Snowflake, X } from "lucide-react"
import { Medicine, medicinesApi } from "@/features/medicines/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { apiGet, apiPatch, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useToast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"
import { DualDateInput } from "@/components/ui/dual-date-input"
import { priceHistoryApi, type MedicinePriceHistoryRow } from "@/features/medicines/api-client-price-history"
import { compareFefo, formatBatchExpiry, isSellableOn } from "@/lib/inventory/fefo"

interface MedicineDetailModalProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
}

interface MedicineBatch {
  id: string
  batch_number: string
  expiry_date: string | null
  quantity_received: number
  quantity_remaining: number
  selling_price: number | string | null
  rack_location: string | null
  received_at: string
  recalled_at: string | null
  recall_reason: string | null
  branches: { id: string; name: string; code: string } | null
}

export default function MedicineDetailModal({ medicine, isOpen, onClose }: MedicineDetailModalProps) {
  const [batches, setBatches] = useState<MedicineBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [recallTarget, setRecallTarget] = useState<string | null>(null)
  const [recallReason, setRecallReason] = useState("")
  const [recalling, setRecalling] = useState(false)
  const [editingRackFor, setEditingRackFor] = useState<string | null>(null)
  const [rackDraft, setRackDraft] = useState("")
  const [savingRack, setSavingRack] = useState(false)
  const { toast } = useToast()

  const [priceHistory, setPriceHistory] = useState<MedicinePriceHistoryRow[]>([])
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduledPrice, setScheduledPrice] = useState("")
  const [scheduledDate, setScheduledDate] = useState("")

  const loadPriceHistory = () => {
    if (!medicine) return
    setPriceHistoryLoading(true)
    priceHistoryApi
      .list(medicine.id)
      .then(({ data }) => setPriceHistory(data))
      .finally(() => setPriceHistoryLoading(false))
  }

  const loadBatches = () => {
    if (!medicine) return
    setBatchesLoading(true)
    apiGet<MedicineBatch[]>(`/api/medicines/${medicine.id}/batches`)
      .then((data) => setBatches(data || []))
      .catch(() => setBatches([]))
      .finally(() => setBatchesLoading(false))
  }

  useEffect(() => {
    if (!isOpen || !medicine) {
      setBatches([])
      setPriceHistory([])
      setShowScheduleForm(false)
      setEditingRackFor(null)
      setRecallTarget(null)
      return
    }
    loadBatches()
    loadPriceHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, medicine])

  const handleSchedulePrice = async () => {
    if (!medicine) return
    const price = Number(scheduledPrice)
    if (!(price >= 0) || !scheduledDate) {
      toast({ title: "Enter a price and effective date", variant: "destructive" })
      return
    }
    setScheduling(true)
    try {
      const { error } = await priceHistoryApi.schedule(medicine.id, { unit_price: price, effective_from: scheduledDate })
      if (error) throw new Error(error)
      const isToday = scheduledDate <= new Date().toISOString().slice(0, 10)
      toast({ title: isToday ? "Price updated" : "Price change scheduled", description: isToday ? undefined : `Takes effect ${scheduledDate}` })
      setShowScheduleForm(false)
      setScheduledPrice("")
      setScheduledDate("")
      loadPriceHistory()
    } catch (error) {
      toast({ title: "Could not schedule price change", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setScheduling(false)
    }
  }

  const handleCancelScheduled = async (historyId: string) => {
    if (!medicine) return
    const { error } = await priceHistoryApi.cancelScheduled(medicine.id, historyId)
    if (error) {
      toast({ title: "Could not cancel", description: error, variant: "destructive" })
      return
    }
    toast({ title: "Scheduled price change cancelled" })
    loadPriceHistory()
  }

  const handleRecall = async (batchNumber: string) => {
    if (!medicine) return
    setRecalling(true)
    const { affected, error } = await medicinesApi.recallBatch(medicine.id, batchNumber, recallReason || null)
    setRecalling(false)
    if (error) {
      toast({ title: "Recall failed", description: error, variant: "destructive" })
      return
    }
    toast({ title: "Batch recalled", description: `${affected} batch row(s) blocked from sale.` })
    setRecallTarget(null)
    setRecallReason("")
    loadBatches()
  }

  const handleSaveRackLocation = async (batchId: string) => {
    if (!medicine) return
    setSavingRack(true)
    try {
      const token = await getCSRFToken()
      await apiPatch(`/api/medicines/${medicine.id}/batches/${batchId}`, { rack_location: rackDraft.trim() || null }, token)
      setBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, rack_location: rackDraft.trim() || null } : b)))
      setEditingRackFor(null)
    } catch (error) {
      toast({ title: "Could not save location", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setSavingRack(false)
    }
  }

  if (!medicine) return null

  const today = new Date().toISOString().slice(0, 10)
  const soonLimit = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const orderedBatches = [...batches].sort((a, b) =>
    compareFefo(
      { expiry_date: a.expiry_date, received_at: a.received_at },
      { expiry_date: b.expiry_date, received_at: b.received_at }
    )
  )
  const sellFirst = orderedBatches.find(
    (batch) => batch.quantity_remaining > 0 && !batch.recalled_at && isSellableOn(batch.expiry_date, today)
  )

  const stockStatus =
    medicine.stock_quantity === 0
      ? { label: "Out of stock", variant: "destructive" as const }
      : medicine.stock_quantity <= medicine.minimum_stock
        ? { label: "Low stock", variant: "secondary" as const }
        : { label: "In stock", variant: "default" as const }

  const batchTone = (batch: MedicineBatch) => {
    if (batch.recalled_at) return { label: "Recalled", variant: "destructive" as const }
    if (!batch.expiry_date) return { label: "No expiry", variant: "outline" as const }
    if (!isSellableOn(batch.expiry_date, today)) return { label: "Expired", variant: "destructive" as const }
    if (batch.expiry_date.slice(0, 10) <= soonLimit) return { label: "Expiring soon", variant: "secondary" as const }
    return { label: "In date", variant: "outline" as const }
  }

  const identity = [
    ["Generic name", medicine.generic_name || "Not set"],
    ["Brand name", medicine.brand_name || "Not set"],
    ["Form", medicine.form || "Not set"],
    ["Strength", medicine.strength || "Not set"],
    ["Dosage", medicine.dosage || "Not set"],
    ["Category", medicine.categories?.name || "Uncategorized"],
    ["Supplier", medicine.suppliers?.name || "Not set"],
    ["Barcode", medicine.barcode || "Not set"],
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4 pr-14">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Pill className="h-5 w-5 text-primary" aria-hidden />
            {medicine.name}
          </DialogTitle>
          <DialogDescription>
            {[medicine.generic_name, medicine.strength, medicine.form].filter(Boolean).join(" · ") || "Medicine details"}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
            {medicine.prescription_required && (
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Prescription required
              </Badge>
            )}
            {medicine.requires_cold_chain && (
              <Badge variant="outline" className="gap-1">
                <Snowflake className="h-3 w-3" aria-hidden />
                Cold chain
                {(medicine.storage_temp_min_c != null || medicine.storage_temp_max_c != null) &&
                  ` ${medicine.storage_temp_min_c ?? "?"}–${medicine.storage_temp_max_c ?? "?"}°C`}
              </Badge>
            )}
          </div>
        </DialogHeader>
        <DialogScrollBody className="space-y-8 py-5">
          <section aria-label="Stock and price" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">On hand</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{medicine.stock_quantity}</p>
              <p className="mt-1 text-xs text-muted-foreground">Min {medicine.minimum_stock} · Max {medicine.maximum_stock}</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Selling price</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                <CurrencyDisplay amount={Number.parseFloat(medicine.unit_price)} />
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Cost price</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                <CurrencyDisplay amount={Number.parseFloat(medicine.cost_price)} />
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Sell this first</p>
              {sellFirst ? (
                <>
                  <p className="mt-1 truncate text-lg font-semibold">{sellFirst.batch_number}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sellFirst.rack_location || "Rack not set"}
                    {" · Exp "}
                    {formatBatchExpiry(sellFirst.expiry_date) ?? "not set"}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No sellable batch</p>
              )}
            </div>
          </section>

          <section aria-labelledby="lots-heading" className="space-y-3">
            <div>
              <h2 id="lots-heading" className="text-base font-semibold">Lots on the shelf</h2>
              <p className="text-sm text-muted-foreground">Soonest expiry is sold first.</p>
            </div>
            {batchesLoading ? (
              <div className="space-y-3" aria-busy="true" aria-live="polite">
                <p className="sr-only">Loading batches</p>
                <div className="h-28 rounded-lg bg-muted motion-reduce:animate-none animate-pulse" />
                <div className="h-28 rounded-lg bg-muted motion-reduce:animate-none animate-pulse" />
              </div>
            ) : orderedBatches.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm font-medium">No batches yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A batch is created when stock is added from Add Medicine, bulk import, or a purchase receipt.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {orderedBatches.map((batch) => {
                  const tone = batchTone(batch)
                  const isSellFirst = sellFirst?.id === batch.id
                  return (
                    <li
                      key={batch.id}
                      className={`rounded-lg border p-4 ${isSellFirst ? "border-primary" : ""} ${batch.recalled_at ? "border-destructive/50" : ""}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{batch.batch_number}</p>
                            {isSellFirst && <Badge>Sell this first</Badge>}
                            <Badge variant={tone.variant} className="gap-1">
                              {tone.label === "Recalled" && <Ban className="h-3 w-3" aria-hidden />}
                              {tone.label === "Expiring soon" && <Clock className="h-3 w-3" aria-hidden />}
                              {tone.label === "Expired" && <AlertTriangle className="h-3 w-3" aria-hidden />}
                              {tone.label}
                            </Badge>
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">Rack</dt>
                              <dd className="font-medium">{batch.rack_location || "Not set"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Expiry</dt>
                              <dd className="font-medium">{formatBatchExpiry(batch.expiry_date) ?? "Not set"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Remaining</dt>
                              <dd className="font-medium tabular-nums">
                                {batch.quantity_remaining}
                                <span className="font-normal text-muted-foreground"> / {batch.quantity_received}</span>
                              </dd>
                            </div>
                          </dl>
                          <p className="text-xs text-muted-foreground">
                            {batch.branches?.name || "Branch"} · Received {formatBatchExpiry(batch.received_at) ?? new Date(batch.received_at).toLocaleDateString()}
                            {batch.selling_price != null && (
                              <>
                                {" · "}
                                <CurrencyDisplay amount={Number(batch.selling_price)} /> this lot
                              </>
                            )}
                          </p>
                        </div>
                        {!batch.recalled_at && recallTarget !== batch.batch_number && (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              setRecallTarget(batch.batch_number)
                              setRecallReason("")
                            }}
                          >
                            Recall
                          </Button>
                        )}
                      </div>

                      {editingRackFor === batch.id ? (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="flex-1 space-y-1">
                            <Label htmlFor={`rack-${batch.id}`}>Rack</Label>
                            <Input
                              id={`rack-${batch.id}`}
                              value={rackDraft}
                              onChange={(e) => setRackDraft(e.target.value)}
                              placeholder="e.g. Rack 3"
                              maxLength={60}
                              className="min-h-11"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveRackLocation(batch.id)
                                if (e.key === "Escape") setEditingRackFor(null)
                              }}
                            />
                          </div>
                          <Button type="button" className="min-h-11" disabled={savingRack} onClick={() => handleSaveRackLocation(batch.id)}>
                            <Check className="h-4 w-4" aria-hidden />
                            {savingRack ? "Saving…" : "Save rack"}
                          </Button>
                          <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditingRackFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          className="mt-2 min-h-11 cursor-pointer px-2"
                          onClick={() => {
                            setEditingRackFor(batch.id)
                            setRackDraft(batch.rack_location || "")
                          }}
                        >
                          <MapPin className="h-4 w-4" aria-hidden />
                          {batch.rack_location ? "Change rack" : "Set rack"}
                        </Button>
                      )}

                      {batch.recalled_at && batch.recall_reason && (
                        <p className="mt-2 text-sm text-muted-foreground">Reason: {batch.recall_reason}</p>
                      )}
                      {recallTarget === batch.batch_number && (
                        <div className="mt-3 space-y-2 border-t pt-3">
                          <Label htmlFor={`recall-${batch.id}`}>Recall reason</Label>
                          <Input
                            id={`recall-${batch.id}`}
                            value={recallReason}
                            onChange={(e) => setRecallReason(e.target.value)}
                            placeholder="Supplier recall notice"
                            className="min-h-11"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="destructive" className="min-h-11" disabled={recalling} onClick={() => handleRecall(batch.batch_number)}>
                              {recalling ? "Recalling…" : "Confirm recall"}
                            </Button>
                            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRecallTarget(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="identity-heading" className="space-y-3">
            <h2 id="identity-heading" className="text-base font-semibold">Details</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {identity.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
              {medicine.units_per_pack != null && (
                <div>
                  <dt className="text-muted-foreground">Pack size</dt>
                  <dd className="font-medium">
                    {medicine.units_per_pack} {medicine.unit_label || "units"}/pack
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section aria-labelledby="price-history-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="price-history-heading" className="flex items-center gap-2 text-base font-semibold">
                <History className="h-4 w-4" aria-hidden />
                Price history
              </h2>
              {!showScheduleForm && (
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setShowScheduleForm(true)}>
                  Schedule price change
                </Button>
              )}
            </div>
            {showScheduleForm && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="scheduled-price">New price</Label>
                    <Input
                      id="scheduled-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={scheduledPrice}
                      onChange={(e) => setScheduledPrice(e.target.value)}
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="scheduled-date">Effective from</Label>
                    <DualDateInput value={scheduledDate} onChange={setScheduledDate} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Today applies immediately. A future date waits until the pharmacy is used on or after that day.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="min-h-11" onClick={handleSchedulePrice} disabled={scheduling}>
                    {scheduling ? "Saving…" : "Save"}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => setShowScheduleForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {priceHistoryLoading ? (
              <div className="h-16 rounded-lg bg-muted motion-reduce:animate-none animate-pulse" aria-busy="true">
                <span className="sr-only">Loading price history</span>
              </div>
            ) : priceHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No price history yet.</p>
            ) : (
              <ul className="space-y-2">
                {priceHistory.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">
                        <CurrencyDisplay amount={row.unit_price} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.status === "scheduled"
                          ? `Scheduled from ${row.effective_from}`
                          : row.effective_to
                            ? `${row.effective_from} to ${row.effective_to}`
                            : `Since ${row.effective_from}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.status === "active" && <Badge>Current</Badge>}
                      {row.status === "scheduled" && <Badge variant="secondary">Scheduled</Badge>}
                      {row.status === "scheduled" && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11"
                          onClick={() => handleCancelScheduled(row.id)}
                          aria-label="Cancel this scheduled price change"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(medicine.side_effects || medicine.storage_instructions) && (
            <section aria-labelledby="notes-heading" className="space-y-3">
              <h2 id="notes-heading" className="text-base font-semibold">Storage and safety</h2>
              {medicine.storage_instructions && (
                <div>
                  <h3 className="text-sm font-medium">Storage</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{medicine.storage_instructions}</p>
                </div>
              )}
              {medicine.side_effects && (
                <div>
                  <h3 className="text-sm font-medium">Side effects</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{medicine.side_effects}</p>
                </div>
              )}
            </section>
          )}
        </DialogScrollBody>
        <DialogStickyFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            Close
          </Button>
        </DialogStickyFooter>

      </DialogContent>
    </Dialog>
  )
}
