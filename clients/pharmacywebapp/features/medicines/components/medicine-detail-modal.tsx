"use client"
import { useEffect, useState } from "react"
import { AlertTriangle, Ban, Clock, History, Package, ShieldAlert, Snowflake, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldError } from "@/components/ui/field-error"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { CurrencyDisplay } from "@/components/currency-display"
import { Medicine, medicinesApi, type MedicineBatch } from "@/features/medicines/api-client"
import { useSupplier } from "@/features/suppliers/hooks/use-suppliers"
import { useToast } from "@/hooks/use-toast"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { cn } from "@/lib/utils"
import { priceHistoryApi, type MedicinePriceHistoryRow } from "@/features/medicines/api-client-price-history"
import { compareFefo, formatBatchExpiry, isSellableOn } from "@/lib/inventory/fefo"
import { MedicineSalesHistory } from "@/features/medicines/components/medicine-sales-history"

interface MedicineDetailModalProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
}

function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(n) ? n : 0
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function StatTile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-xl font-semibold tabular-nums">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Medicine details in the standard right-side panel, in four tabs: Overview (stock, prices, margin, what to
 * sell first), Batches (FEFO lots with per-lot cost, recall), Details (identity, supplier, tax/controlled
 * flags, storage and clinical notes) and Prices (history + scheduling).
 */
export default function MedicineDetailModal({ medicine, isOpen, onClose }: MedicineDetailModalProps) {
  const [tab, setTab] = useState("overview")
  const [batches, setBatches] = useState<MedicineBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [batchesError, setBatchesError] = useState<string | null>(null)
  const [recallTarget, setRecallTarget] = useState<string | null>(null)
  const [recallReason, setRecallReason] = useState("")
  const [recalling, setRecalling] = useState(false)
  const [priceTarget, setPriceTarget] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState("")
  const [savingPrice, setSavingPrice] = useState(false)
  const { toast } = useToast()

  const [priceHistory, setPriceHistory] = useState<MedicinePriceHistoryRow[]>([])
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduledPrice, setScheduledPrice] = useState("")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduleErrors, setScheduleErrors] = useState<{ price?: string; date?: string }>({})

  const supplierQuery = useSupplier(isOpen ? medicine?.supplier_id ?? "" : "")
  const supplierName = medicine?.suppliers?.name ?? supplierQuery.data?.name ?? null

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
    setBatchesError(null)
    medicinesApi
      .getMedicineBatches(medicine.id)
      .then(({ data, error }) => {
        setBatches(data)
        setBatchesError(error)
      })
      .finally(() => setBatchesLoading(false))
  }

  useEffect(() => {
    if (!isOpen || !medicine) {
      setBatches([])
      setPriceHistory([])
      setShowScheduleForm(false)
      setRecallTarget(null)
      setPriceTarget(null)
      setTab("overview")
      return
    }
    loadBatches()
    loadPriceHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, medicine])

  const handleSchedulePrice = async () => {
    if (!medicine) return
    const price = Number(scheduledPrice)
    const errors: { price?: string; date?: string } = {}
    if (!scheduledPrice.trim() || !(price >= 0)) errors.price = "Enter a price of 0 or more."
    if (!scheduledDate) errors.date = "Pick the day the new price starts."
    setScheduleErrors(errors)
    if (errors.price || errors.date) return
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
      // Batches still at the old medicine price move with it.
      if (isToday) loadBatches()
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

  const handleBatchPrice = async (batchId: string) => {
    const price = Number(priceDraft)
    if (!priceDraft.trim() || !(price > 0)) {
      toast({ title: "Enter a price above 0", variant: "destructive" })
      return
    }
    setSavingPrice(true)
    const { error } = await medicinesApi.updateBatchSellingPrice(batchId, price)
    setSavingPrice(false)
    if (error) {
      toast({ title: "Could not change the price", description: error, variant: "destructive" })
      return
    }
    toast({ title: "Batch price updated", description: "Sales from this batch now charge the new price." })
    setPriceTarget(null)
    setPriceDraft("")
    loadBatches()
  }

  if (!medicine) return null

  const today = new Date().toISOString().slice(0, 10)
  const soonLimit = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const liveBatches = batches.filter((b) => !b.is_disposed)
  const disposedCount = batches.length - liveBatches.length
  const orderedBatches = [...liveBatches].sort((a, b) =>
    compareFefo(
      { expiry_date: a.expiry_date, received_at: a.received_at },
      { expiry_date: b.expiry_date, received_at: b.received_at }
    )
  )
  const sellFirst = orderedBatches.find(
    (batch) => batch.quantity_remaining > 0 && !batch.recalled_at && isSellableOn(batch.expiry_date, today)
  )

  const stock = medicine.branch_stock_quantity ?? medicine.stock_quantity
  const stockStatus =
    stock === 0
      ? { label: "Out of stock", variant: "danger" as const }
      : stock <= medicine.minimum_stock
        ? { label: "Low stock", variant: "warning" as const }
        : { label: "In stock", variant: "success" as const }

  const unitPrice = num(medicine.unit_price)
  const costPrice = num(medicine.cost_price)
  const marginPercent = unitPrice > 0 && costPrice > 0 ? Math.round(((unitPrice - costPrice) / unitPrice) * 1000) / 10 : null
  const stockValue = Math.round(stock * costPrice * 100) / 100

  const batchTone = (batch: MedicineBatch) => {
    if (batch.recalled_at) return { label: "Recalled", variant: "danger" as const, icon: Ban }
    if (!batch.expiry_date) return { label: "No expiry", variant: "outline" as const, icon: null }
    if (!isSellableOn(batch.expiry_date, today)) return { label: "Expired", variant: "danger" as const, icon: AlertTriangle }
    if (batch.expiry_date.slice(0, 10) <= soonLimit) return { label: "Expiring soon", variant: "warning" as const, icon: Clock }
    return { label: "In date", variant: "outline" as const, icon: null }
  }

  return (
    <DetailSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      size="xl"
      title={medicine.name}
      description={[medicine.generic_name, medicine.strength, medicine.form].filter(Boolean).join(" · ") || "Medicine details"}
      badges={
        <>
          <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
          {medicine.is_active === false && <Badge variant="muted">Archived</Badge>}
          {medicine.prescription_required && (
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Rx
            </Badge>
          )}
          {medicine.controlled_substance && (
            <Badge variant="warning" className="gap-1">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              Controlled{medicine.controlled_schedule ? ` · Sch ${medicine.controlled_schedule}` : ""}
            </Badge>
          )}
          {medicine.requires_cold_chain && (
            <Badge variant="info" className="gap-1">
              <Snowflake className="h-3 w-3" aria-hidden />
              Cold chain
            </Badge>
          )}
        </>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="batches">
            Batches
            {!batchesLoading && <span className="num ml-1 text-muted-foreground">({orderedBatches.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="prices">Prices</TabsTrigger>
          <TabsTrigger value="sales">Sales history</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <section aria-label="Stock and price" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              label="On hand (this branch)"
              hint={
                <>
                  All branches <span className="num">{medicine.stock_quantity}</span> · Reorder at{" "}
                  <span className="num">{medicine.minimum_stock}</span>
                  {medicine.maximum_stock > 0 && (
                    <>
                      {" "}
                      · Max <span className="num">{medicine.maximum_stock}</span>
                    </>
                  )}
                </>
              }
            >
              {stock}
            </StatTile>
            <StatTile label="Selling price" hint={medicine.is_taxable === false ? "VAT exempt" : "Includes VAT"}>
              <CurrencyDisplay amount={unitPrice} />
            </StatTile>
            <StatTile label="Cost price" hint={marginPercent !== null ? `Margin ${marginPercent}%` : "Margin unknown"}>
              <CurrencyDisplay amount={costPrice} />
            </StatTile>
            <StatTile label="Stock value at cost">
              <CurrencyDisplay amount={stockValue} />
            </StatTile>
            <StatTile
              label="Sell this first"
              hint={
                sellFirst
                  ? `${sellFirst.rack_location || "Rack not set"} · Exp ${formatBatchExpiry(sellFirst.expiry_date) ?? "not set"}`
                  : undefined
              }
            >
              {sellFirst ? (
                <span className="font-mono text-base">{sellFirst.batch_number}</span>
              ) : (
                <span className="text-sm font-normal text-muted-foreground">No sellable batch</span>
              )}
            </StatTile>
            <StatTile label="Nearest expiry">
              <span className="text-base">{formatBatchExpiry(medicine.batch_nearest_expiry ?? medicine.expiry_date) ?? "—"}</span>
            </StatTile>
          </section>
          {(medicine.batch_rack_locations?.length ?? 0) > 0 && (
            <DetailFields columns={1}>
              <DetailField label="Shelf / rack">{medicine.batch_rack_locations?.join(", ")}</DetailField>
            </DetailFields>
          )}
        </TabsContent>

        <TabsContent value="batches" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Soonest expiry is sold first.
            {disposedCount > 0 && (
              <span className="num">
                {" "}
                {disposedCount} written-off {disposedCount === 1 ? "lot is" : "lots are"} hidden.
              </span>
            )}
          </p>
          {batchesLoading ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <p className="sr-only">Loading batches</p>
              <div className="h-28 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
              <div className="h-28 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            </div>
          ) : batchesError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">Couldn&apos;t load batches</p>
              <p className="mt-1 text-muted-foreground">{batchesError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={loadBatches}>
                Try again
              </Button>
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
                const ToneIcon = tone.icon
                return (
                  <li
                    key={batch.id}
                    className={cn("rounded-lg border p-4", isSellFirst && "border-primary", batch.recalled_at && "border-destructive/50")}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono font-semibold">{batch.batch_number}</p>
                          {isSellFirst && <Badge>Sell this first</Badge>}
                          <Badge variant={tone.variant} className="gap-1">
                            {ToneIcon && <ToneIcon className="h-3 w-3" aria-hidden />}
                            {tone.label}
                          </Badge>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-xs text-muted-foreground">Expiry</dt>
                            <dd className="font-medium">{formatBatchExpiry(batch.expiry_date) ?? "Not set"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Remaining</dt>
                            <dd className="font-medium tabular-nums">
                              {batch.quantity_remaining}
                              <span className="font-normal text-muted-foreground"> / {batch.quantity_received}</span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Cost</dt>
                            <dd className="font-medium tabular-nums">
                              {batch.cost_price != null ? <CurrencyDisplay amount={Number(batch.cost_price)} /> : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Selling</dt>
                            <dd className="font-medium tabular-nums">
                              {batch.selling_price != null ? <CurrencyDisplay amount={Number(batch.selling_price)} /> : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Rack</dt>
                            <dd className="font-medium">{batch.rack_location || "Not set"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Branch</dt>
                            <dd className="font-medium">{batch.branches?.name || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Received</dt>
                            <dd className="font-medium">{formatDateTime(batch.received_at) ?? "—"}</dd>
                          </div>
                        </dl>
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

                    {batch.recalled_at && batch.recall_reason && (
                      <p className="mt-2 text-sm text-muted-foreground">Recall reason: {batch.recall_reason}</p>
                    )}
                    {!batch.is_disposed && priceTarget !== batch.id && (
                      <Button
                        type="button"
                        variant="link"
                        className="mt-1 h-auto px-0 text-sm"
                        onClick={() => {
                          setPriceTarget(batch.id)
                          setPriceDraft(batch.selling_price != null ? String(batch.selling_price) : "")
                        }}
                      >
                        Change selling price
                      </Button>
                    )}
                    {priceTarget === batch.id && (
                      <form
                        className="mt-3 space-y-2 border-t pt-3"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleBatchPrice(batch.id)
                        }}
                      >
                        <Label htmlFor={`batch-price-${batch.id}`}>Selling price for batch {batch.batch_number}</Label>
                        <Input
                          id={`batch-price-${batch.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          className="num min-h-11 max-w-[12rem]"
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                          Sales charge each batch&apos;s own price. Use this when this lot&apos;s MRP differs; changing the
                          medicine&apos;s price moves every batch still at the old price.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" className="min-h-11" loading={savingPrice} loadingText="Saving…">
                            Save price
                          </Button>
                          <Button type="button" variant="outline" className="min-h-11" onClick={() => setPriceTarget(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                    {recallTarget === batch.batch_number && (
                      <form
                        className="mt-3 space-y-2 border-t pt-3"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleRecall(batch.batch_number)
                        }}
                      >
                        <Label htmlFor={`recall-${batch.id}`}>Recall reason</Label>
                        <Input
                          id={`recall-${batch.id}`}
                          value={recallReason}
                          onChange={(e) => setRecallReason(e.target.value)}
                          placeholder="Supplier recall notice"
                          className="min-h-11"
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground">Recalled stock is blocked from sale at every branch.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" variant="destructive" className="min-h-11" loading={recalling} loadingText="Recalling…">
                            Confirm recall
                          </Button>
                          <Button type="button" variant="outline" className="min-h-11" onClick={() => setRecallTarget(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Rack locations are set when stock is received; they can&apos;t be edited here yet.
          </p>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          <DetailSection title="Identity">
            <DetailFields>
              <DetailField label="Generic name">{medicine.generic_name}</DetailField>
              <DetailField label="Brand name">{medicine.brand_name}</DetailField>
              <DetailField label="Form">{medicine.form}</DetailField>
              <DetailField label="Strength">{medicine.strength}</DetailField>
              <DetailField label="Dosage">{medicine.dosage}</DetailField>
              <DetailField label="Category">{medicine.categories?.name ?? (medicine.category_id ? null : "Uncategorized")}</DetailField>
              <DetailField label="Barcode" mono>
                {medicine.barcode}
              </DetailField>
              <DetailField label="Pack size">
                {medicine.units_per_pack != null ? `${medicine.units_per_pack} ${medicine.unit_label || "units"} / pack` : null}
              </DetailField>
            </DetailFields>
          </DetailSection>

          <DetailSection title="Supply and tax">
            <DetailFields>
              <DetailField label="Supplier">
                {medicine.supplier_id ? (supplierQuery.isLoading ? "Loading…" : supplierName ?? "Unknown supplier") : "Not set"}
              </DetailField>
              <DetailField label="Last supplier bill no." mono>
                {medicine.supplier_invoice_number}
              </DetailField>
              <DetailField label="VAT">{medicine.is_taxable === false ? "Exempt" : "Taxable (13%, included in price)"}</DetailField>
              <DetailField label="Prescription">{medicine.prescription_required ? "Required" : "Not required"}</DetailField>
              <DetailField label="Controlled">
                {medicine.controlled_substance
                  ? `Yes${medicine.controlled_schedule ? ` — Schedule ${medicine.controlled_schedule}` : ""}`
                  : "No"}
              </DetailField>
              <DetailField label="Last updated">{formatDateTime(medicine.updated_at)}</DetailField>
            </DetailFields>
          </DetailSection>

          {(medicine.description || medicine.storage_instructions || medicine.side_effects || medicine.requires_cold_chain) && (
            <DetailSection title="Storage and clinical notes">
              <DetailFields columns={1}>
                {medicine.description && <DetailField label="Description">{medicine.description}</DetailField>}
                {medicine.requires_cold_chain && (
                  <DetailField label="Cold chain">
                    Keep between {medicine.storage_temp_min_c ?? "?"}°C and {medicine.storage_temp_max_c ?? "?"}°C
                  </DetailField>
                )}
                {medicine.storage_instructions && <DetailField label="Storage">{medicine.storage_instructions}</DetailField>}
                {medicine.side_effects && <DetailField label="Side effects">{medicine.side_effects}</DetailField>}
              </DetailFields>
            </DetailSection>
          )}
        </TabsContent>

        <TabsContent value="prices" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4" aria-hidden />
              Price history
            </h3>
            {!showScheduleForm && (
              <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setShowScheduleForm(true)}>
                Schedule price change
              </Button>
            )}
          </div>
          {showScheduleForm && (
            <form
              className="space-y-3 rounded-lg border p-4"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSchedulePrice()
              }}
              noValidate
            >
              <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <legend className="sr-only">New selling price</legend>
                <div className="space-y-1">
                  <Label htmlFor="scheduled-price">
                    New price <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <Input
                    id="scheduled-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={scheduledPrice}
                    onChange={(e) => setScheduledPrice(e.target.value)}
                    className="num min-h-11"
                    required
                    aria-invalid={scheduleErrors.price ? true : undefined}
                  />
                  <FieldError message={scheduleErrors.price} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="scheduled-date">
                    Effective from <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <DatePicker id="scheduled-date" value={scheduledDate} onChange={setScheduledDate} min={formatLocalDateYmd(new Date())} allowFuture />
                  <FieldError message={scheduleErrors.date} />
                </div>
              </fieldset>
              <p className="text-sm text-muted-foreground">
                Today applies immediately. A future date waits until the pharmacy is used on or after that day.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-11" loading={scheduling} loadingText="Saving…">
                  Save price change
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setShowScheduleForm(false)
                    setScheduleErrors({})
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {priceHistoryLoading ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-busy="true">
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
                    {row.status === "scheduled" && <Badge variant="info">Scheduled</Badge>}
                    {row.status === "scheduled" && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11"
                        onClick={() => handleCancelScheduled(row.id)}
                        aria-label="Cancel this scheduled price change"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="sales">
          {tab === "sales" && <MedicineSalesHistory medicineId={medicine.id} />}
        </TabsContent>
      </Tabs>
    </DetailSheet>
  )
}
