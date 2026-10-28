"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { AlertTriangle, ArrowRight, ClipboardCheck, Loader2, PackageMinus, Scale } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { medicinesApi, type Medicine, type MedicineBatch } from "@/features/medicines/api-client"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"

type Mode = "remove" | "count"

const REMOVE_REASONS = [
  { value: "Damaged / breakage", label: "Damaged / breakage" },
  { value: "Expired — written off", label: "Expired — written off" },
  { value: "Theft / lost", label: "Theft / lost" },
  { value: "Returned to supplier (no bill)", label: "Returned to supplier (no bill)" },
  { value: "Other", label: "Other" },
] as const

interface AdjustStockDialogProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
  onAdjusted: () => void
}

function expiryState(expiry: string | null): { label: string; tone: "danger" | "warning" | "muted" } | null {
  if (!expiry) return null
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: "Expired", tone: "danger" }
  if (days <= 90) return { label: `Expires in ${days}d`, tone: "warning" }
  return { label: `Exp ${expiry.slice(0, 10)}`, tone: "muted" }
}

/**
 * Stock corrections at batch level, so the right lot is touched and the books follow: removing
 * units (damaged, expired, theft) posts a stock loss at that lot's cost; a count correction sets
 * the lot to what was counted and posts the difference as a loss or gain. Deliveries are not
 * adjustments — they go through "Add stock" so the supplier bill is recorded.
 */
export function AdjustStockDialog({ medicine, isOpen, onClose, onAdjusted }: AdjustStockDialogProps) {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const queryClient = useQueryClient()
  const [batches, setBatches] = useState<MedicineBatch[] | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("remove")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState<string>(REMOVE_REASONS[0].value)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !medicine) return
    setBatches(null)
    setBatchId(null)
    setMode("remove")
    setQuantity("")
    setReason(REMOVE_REASONS[0].value)
    setNote("")
    setError(undefined)
    void medicinesApi.getMedicineBatches(medicine.id).then(({ data }) => {
      // Live lots with stock, earliest expiry first — the order staff pick them off the shelf.
      const live = data
        .filter((b) => !b.is_disposed && b.quantity_remaining > 0)
        .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"))
      setBatches(live)
      setBatchId(live[0]?.id ?? null)
    })
  }, [isOpen, medicine])

  const batch = batches?.find((b) => b.id === batchId) ?? null
  const entered = Number.parseFloat(quantity)
  const onHand = batch?.quantity_remaining ?? 0
  const newQuantity = !batch || !Number.isFinite(entered) ? null : mode === "remove" ? onHand - entered : entered
  const delta = newQuantity === null ? 0 : newQuantity - onHand
  const unitCost = Number(batch?.cost_price ?? 0)
  const valueChange = Math.round(delta * unitCost * 100) / 100

  const validationError = useMemo(() => {
    if (!batch || quantity === "") return undefined
    if (!Number.isFinite(entered) || entered < 0) return "Enter a quantity of 0 or more."
    if (mode === "remove" && entered === 0) return "Enter how many units to remove."
    if (mode === "remove" && entered > onHand) return `This batch only has ${onHand} on hand.`
    if (mode === "count" && entered === onHand) return "That's already the quantity on hand."
    return undefined
  }, [batch, quantity, entered, mode, onHand])

  /** One Idempotency-Key per adjustment, reused when the same adjustment is submitted again. */
  const adjustKeys = useRef(createIdempotencyKeyTracker())

  const handleSubmit = async () => {
    if (!batch || newQuantity === null) {
      setError("Enter a quantity.")
      return
    }
    if (validationError) {
      setError(validationError)
      return
    }
    const fullReason = [mode === "count" ? "Stock count correction" : reason, note.trim()].filter(Boolean).join(" — ")
    setSaving(true)
    const { error: apiError } = await medicinesApi.adjustBatch(
      batch.id,
      newQuantity,
      fullReason,
      adjustKeys.current.keyFor(JSON.stringify([batch.id, newQuantity, fullReason])),
    )
    setSaving(false)
    if (apiError) {
      toast({ title: "Couldn't adjust the stock", description: apiError, variant: "destructive" })
      return
    }
    adjustKeys.current.reset()
    queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
    queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
    window.dispatchEvent(new CustomEvent("refresh-medicines"))
    window.dispatchEvent(new CustomEvent("refresh-data"))
    toast({
      title: "Stock adjusted",
      description: `Batch ${batch.batch_number}: ${onHand} → ${newQuantity}`,
    })
    onAdjusted()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "max-h-[90vh] sm:max-w-xl")}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Adjust or write off stock</DialogTitle>
          <DialogDescription>
            {medicine ? [medicine.name, medicine.strength, medicine.form].filter(Boolean).join(" · ") : ""}. For deliveries, use Add
            stock instead so the supplier bill is recorded.
          </DialogDescription>
        </DialogHeader>

        <DialogScrollBody className="space-y-5 py-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Batch</legend>
            {batches === null ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : batches.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No batch of this medicine has stock to adjust.
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Batch">
                {batches.map((b) => {
                  const expiry = expiryState(b.expiry_date)
                  const selected = b.id === batchId
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setBatchId(b.id)
                        setError(undefined)
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-semibold">{b.batch_number}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[b.branches?.name, b.rack_location && `Rack ${b.rack_location}`, b.cost_price != null && `Cost ${formatCurrency(Number(b.cost_price))}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-semibold tabular-nums">{b.quantity_remaining} on hand</span>
                        {expiry && (
                          <Badge variant={expiry.tone === "muted" ? "outline" : expiry.tone} className="text-[11px]">
                            {expiry.label}
                          </Badge>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>

          {batch && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Adjustment type">
                {(
                  [
                    { value: "remove", label: "Remove units", icon: PackageMinus },
                    { value: "count", label: "Correct the count", icon: ClipboardCheck },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === option.value}
                    onClick={() => {
                      setMode(option.value)
                      setQuantity("")
                      setError(undefined)
                    }}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-all duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <option.icon className="size-4" aria-hidden />
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="adjust-quantity">{mode === "remove" ? "Units to remove" : "Units counted on the shelf"}</Label>
                  <Input
                    id="adjust-quantity"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(e.target.value)
                      setError(undefined)
                    }}
                    aria-invalid={!!(error ?? validationError)}
                    autoFocus
                  />
                  <FieldError message={error ?? validationError} />
                </div>
                {mode === "remove" ? (
                  <div>
                    <Label htmlFor="adjust-reason">Reason</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger id="adjust-reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REMOVE_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-end">
                    <p className="text-xs text-muted-foreground">
                      Use after a physical count. The difference is recorded as a stock loss or gain.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="adjust-note">Note</Label>
                <Input
                  id="adjust-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={mode === "remove" ? "e.g. 2 strips crushed in delivery" : "e.g. Monthly count, shelf B3"}
                  maxLength={200}
                />
              </div>

              {newQuantity !== null && !validationError && delta !== 0 && (
                <div
                  className={cn(
                    "space-y-1 rounded-lg border p-3 text-sm",
                    delta < 0 ? "border-destructive/30 bg-destructive/5" : "border-primary/30 bg-primary/5",
                  )}
                  aria-live="polite"
                >
                  <p className="flex items-center gap-2 font-medium tabular-nums">
                    <Scale className="size-4" aria-hidden />
                    {onHand} <ArrowRight className="size-3.5" aria-hidden /> {newQuantity} units in batch {batch.batch_number}
                  </p>
                  <p className="text-muted-foreground">
                    {delta < 0
                      ? `Records a stock loss of ${formatCurrency(Math.abs(valueChange))} (${Math.abs(delta)} × ${formatCurrency(unitCost)}): Cost of goods sold ↑, Inventory ↓.`
                      : `Records a stock gain of ${formatCurrency(valueChange)} (${delta} × ${formatCurrency(unitCost)}): Inventory ↑.`}
                  </p>
                </div>
              )}

              {mode === "remove" && reason.startsWith("Returned to supplier") && (
                <p className="flex items-start gap-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  This only removes the stock at cost. It doesn&apos;t reduce what you owe the supplier.
                </p>
              )}
            </>
          )}
        </DialogScrollBody>

        <DialogStickyFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={delta < 0 ? "destructive" : "default"}
            onClick={() => void handleSubmit()}
            disabled={saving || !batch || quantity === "" || !!validationError}
          >
            {saving && <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />}
            {mode === "remove" ? "Write off" : "Save count"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}
