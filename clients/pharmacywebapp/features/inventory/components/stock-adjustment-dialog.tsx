"use client"

import { useEffect, useState } from "react"
import { ArrowDownRight, ArrowUpRight, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"

/** Same reason codes the medicine edit form sends, so the movement log stays consistent. */
const REASONS = [
  { value: "count_correction", label: "Count correction" },
  { value: "breakage", label: "Breakage / damage" },
  { value: "theft", label: "Theft / loss" },
  { value: "expiry_writeoff", label: "Expiry write-off" },
  { value: "found_stock", label: "Found stock" },
  { value: "other", label: "Other" },
] as const

interface StockAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the adjustment posts so the movement log can reload. */
  onAdjusted: () => void | Promise<void>
}

/**
 * Sets a medicine's on-hand at the signed-in branch to a counted quantity. The API writes the
 * difference to the inventory ledger as an Adjustment carrying the reason (FEFO on decreases).
 */
export function StockAdjustmentDialog({ open, onOpenChange, onAdjusted }: StockAdjustmentDialogProps) {
  const { toast } = useToast()
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [medicinesLoading, setMedicinesLoading] = useState(false)
  const [medicineId, setMedicineId] = useState("")
  const [counted, setCounted] = useState("")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Refetch on every open so "current stock" reflects sales made since last time.
  useEffect(() => {
    if (!open) return
    setMedicineId("")
    setCounted("")
    setReason("")
    setNotes("")
    let active = true
    setMedicinesLoading(true)
    medicinesApi
      .getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" })
      .then((res) => {
        if (active) setMedicines(res.data || [])
      })
      .finally(() => {
        if (active) setMedicinesLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  const medicine = medicines.find((m) => m.id === medicineId)
  // The API adjusts this branch's lots, so compare against branch stock when we have it.
  const current = medicine ? (medicine.branch_stock_quantity ?? medicine.stock_quantity ?? 0) : 0
  const target = counted === "" ? null : Number(counted)
  const validTarget = target !== null && Number.isInteger(target) && target >= 0
  const delta = validTarget && medicine ? target - current : 0
  const canSubmit = Boolean(medicine) && validTarget && delta !== 0 && Boolean(reason) && !submitting

  const handleSubmit = async () => {
    if (!canSubmit || !medicine || target === null) return
    setSubmitting(true)
    try {
      const { error } = await medicinesApi.updateMedicine(medicine.id, {
        stock_quantity: target,
        // The API stores a single reason string (notes aren't forwarded), so fold the note in.
        stock_adjustment_reason: notes.trim() ? `${reason} — ${notes.trim()}` : reason,
      })
      if (error) throw new Error(error)
      toast({
        title: "Stock adjusted",
        description: `${medicine.name}: ${current} → ${target} (${delta > 0 ? "+" : ""}${delta}).`,
      })
      onOpenChange(false)
      await onAdjusted()
    } catch (error) {
      toast({ title: "Adjustment failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record stock adjustment</DialogTitle>
          <DialogDescription>
            Enter the quantity you counted on the shelf. The difference is logged as an adjustment at your current branch.
          </DialogDescription>
        </DialogHeader>

        <form
          id="stock-adjustment-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="adjust-medicine">
              Medicine <span className="text-destructive" aria-hidden>*</span>
            </Label>
            {medicinesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <MedicineCombobox id="adjust-medicine" medicines={medicines} value={medicineId} onValueChange={setMedicineId} placeholder="Search medicine..." />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current stock</Label>
              <div className="num flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm sm:h-9" aria-live="polite">
                {medicine ? current : "—"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-counted">
                Counted quantity <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="adjust-counted"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="num"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                disabled={!medicine}
                aria-invalid={counted !== "" && !validTarget ? true : undefined}
              />
            </div>
          </div>

          {medicine && validTarget && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm animate-fade-in",
                delta === 0 && "text-muted-foreground",
                delta < 0 && "border-destructive/25 bg-destructive/5",
                delta > 0 && "border-success/25 bg-success/5",
              )}
              role="status"
            >
              {delta < 0 && <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />}
              {delta > 0 && <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}
              <span>
                {delta === 0 ? (
                  "Matches current stock — nothing to adjust."
                ) : (
                  <>
                    <span className="num font-semibold">
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </span>{" "}
                    {delta < 0
                      ? "will be removed, oldest-expiring lots first."
                      : "will be added as a new lot at the medicine's cost price. If it has a supplier on credit, a payable may be posted."}
                  </>
                )}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-reason">
                Reason <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="adjust-reason" aria-required="true">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-notes">Notes</Label>
              <Input id="adjust-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional detail" />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="stock-adjustment-form" disabled={!canSubmit} loading={submitting} loadingText="Saving…">
            {!submitting && <SlidersHorizontal aria-hidden />}
            Record adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
