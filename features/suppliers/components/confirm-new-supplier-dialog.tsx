"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmNewSupplierDialogProps {
  open: boolean
  supplierNames: string[]
  confirming?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

/** Asks before a name that is not already on the supplier list is saved. */
export default function ConfirmNewSupplierDialog({
  open,
  supplierNames,
  confirming = false,
  onConfirm,
  onOpenChange,
}: ConfirmNewSupplierDialogProps) {
  const count = supplierNames.length
  const single = count === 1 ? supplierNames[0] : null

  return (
    <Dialog open={open} onOpenChange={(next) => !confirming && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count > 1 ? "Create new suppliers?" : "Create new supplier?"}</DialogTitle>
          <DialogDescription>
            {single
              ? `"${single}" is not in your supplier list. Creating it adds a supplier you can use on bills and purchases.`
              : "These names are not in your supplier list. Creating them adds suppliers you can use on bills and purchases."}
          </DialogDescription>
        </DialogHeader>
        {count > 1 && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {supplierNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={confirming} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11" disabled={confirming || count === 0} onClick={onConfirm}>
            {confirming ? "Creating…" : count > 1 ? "Create suppliers" : "Create supplier"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
