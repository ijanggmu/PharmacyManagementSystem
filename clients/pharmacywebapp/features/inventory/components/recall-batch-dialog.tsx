"use client"

import { useEffect, useState } from "react"
import { Ban, PackageSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
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
import { catalogDotnetApi, type DotnetMedicineBatchDto } from "@/lib/api/catalog-api"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"

const NO_EXPIRY = "9999-12-31"

interface RecallBatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful recall so the page can reload its list. */
  onRecalled: () => void | Promise<void>
}

/**
 * Pull a batch from sale (manufacturer or DDA recall). Recall is by batch number, so every lot
 * of that batch across branches is blocked at once; the stock stays counted until written off.
 */
export function RecallBatchDialog({ open, onOpenChange, onRecalled }: RecallBatchDialogProps) {
  const { toast } = useToast()
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [medicinesLoading, setMedicinesLoading] = useState(false)
  const [medicineId, setMedicineId] = useState("")
  const [batches, setBatches] = useState<DotnetMedicineBatchDto[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [batchNo, setBatchNo] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Medicines load lazily on first open — most visits to this page never recall anything.
  useEffect(() => {
    if (!open) return
    setMedicineId("")
    setBatches([])
    setBatchNo("")
    setReason("")
    if (medicines.length > 0) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    setBatchNo("")
    setBatches([])
    if (!medicineId) return
    let active = true
    setBatchesLoading(true)
    catalogDotnetApi
      .listMedicineBatches(medicineId)
      .then((rows) => {
        if (active) setBatches(rows.filter((b) => !b.isDisposed && !b.isRecalled && b.quantityOnHand > 0))
      })
      .catch((error) => {
        if (active) toast({ title: "Couldn't load batches", description: apiRequestErrorMessage(error), variant: "destructive" })
      })
      .finally(() => {
        if (active) setBatchesLoading(false)
      })
    return () => {
      active = false
    }
  }, [medicineId, toast])

  // One recall covers every lot sharing the batch number, so group the picker by it.
  const batchGroups = Object.values(
    batches.reduce<Record<string, { batchNo: string; expiryDate: string; quantity: number; branches: Set<string> }>>((acc, b) => {
      const g = (acc[b.batchNo] ??= { batchNo: b.batchNo, expiryDate: b.expiryDate, quantity: 0, branches: new Set() })
      g.quantity += b.quantityOnHand
      if (b.branchName) g.branches.add(b.branchName)
      return acc
    }, {}),
  ).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))

  const canSubmit = Boolean(medicineId && batchNo && reason.trim()) && !submitting

  const handleRecall = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const { affected } = await catalogDotnetApi.recallMedicineBatch(medicineId, batchNo, reason.trim())
      toast({
        title: "Batch recalled",
        description: `${affected} lot${affected === 1 ? "" : "s"} blocked from sale. Write them off once returned or destroyed.`,
      })
      onOpenChange(false)
      await onRecalled()
    } catch (error) {
      toast({ title: "Recall failed", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Recall a batch</DialogTitle>
          <DialogDescription>
            Blocks the batch from sale immediately at every branch. The stock stays counted until you write it off here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="recall-medicine">
              Medicine <span className="text-destructive" aria-hidden>*</span>
            </Label>
            {medicinesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <MedicineCombobox id="recall-medicine" medicines={medicines} value={medicineId} onValueChange={setMedicineId} placeholder="Search medicine..." />
            )}
          </div>

          {medicineId && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                Batch <span className="text-destructive" aria-hidden>*</span>
              </legend>
              {batchesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </div>
              ) : batchGroups.length === 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <PackageSearch className="size-5 shrink-0" aria-hidden />
                  No sellable batches in stock for this medicine.
                </div>
              ) : (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Batch to recall">
                  {batchGroups.map((g) => {
                    const selected = batchNo === g.batchNo
                    return (
                      <button
                        key={g.batchNo}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setBatchNo(g.batchNo)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                          selected ? "border-destructive/50 bg-destructive/5 ring-1 ring-destructive/30" : "hover:bg-accent",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block font-mono text-sm font-medium">{g.batchNo}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {g.expiryDate.startsWith(NO_EXPIRY) ? "No expiry" : `Expires ${g.expiryDate.slice(0, 10)}`}
                            {g.branches.size > 0 && ` · ${[...g.branches].join(", ")}`}
                          </span>
                        </span>
                        <span className="num shrink-0 text-sm font-semibold">{g.quantity} on hand</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </fieldset>
          )}

          <div className="space-y-2">
            <Label htmlFor="recall-reason">
              Reason <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Textarea
              id="recall-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. DDA notice 2083/12 — contamination"
              rows={2}
              aria-describedby="recall-reason-hint"
            />
            <p id="recall-reason-hint" className="text-xs text-muted-foreground">
              Kept on the batch for the audit trail and narcotic/DDA inspections.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleRecall()} disabled={!canSubmit} loading={submitting} loadingText="Recalling…">
            {!submitting && <Ban aria-hidden />}
            Recall batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
