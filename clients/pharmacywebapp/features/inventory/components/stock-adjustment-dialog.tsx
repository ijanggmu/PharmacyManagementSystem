"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { AdjustStockDialog } from "@/features/medicines/components/adjust-stock-dialog"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"

interface StockAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the adjustment posts so the movement log can reload. */
  onAdjusted: () => void | Promise<void>
}

/**
 * "Record adjustment" from the movement log: pick the medicine, then adjust one of its batches
 * (write-off or count correction) in the batch-level dialog, so the right lot changes and the
 * loss or gain posts at that lot's cost.
 */
export function StockAdjustmentDialog({ open, onOpenChange, onAdjusted }: StockAdjustmentDialogProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [medicinesLoading, setMedicinesLoading] = useState(false)
  const [medicineId, setMedicineId] = useState("")
  const [adjusting, setAdjusting] = useState<Medicine | null>(null)

  // Refetch on every open so stock figures reflect sales made since last time.
  useEffect(() => {
    if (!open) return
    setMedicineId("")
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

  const medicine = medicines.find((m) => m.id === medicineId) ?? null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record stock adjustment</DialogTitle>
            <DialogDescription>
              Choose the medicine, then the batch to write off or correct after a count. Deliveries go through Add stock.
            </DialogDescription>
          </DialogHeader>

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!medicine}
              onClick={() => {
                setAdjusting(medicine)
                onOpenChange(false)
              }}
            >
              Choose batch
              <ArrowRight className="ml-1 size-4" aria-hidden />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdjustStockDialog
        medicine={adjusting}
        isOpen={adjusting !== null}
        onClose={() => setAdjusting(null)}
        onAdjusted={() => void onAdjusted()}
      />
    </>
  )
}
