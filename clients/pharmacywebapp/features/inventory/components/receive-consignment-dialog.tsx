"use client"

import { useEffect, useRef, useState } from "react"
import { PackagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
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
import { type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import { type Supplier } from "@/features/suppliers/api-client"
import { consignmentApi } from "@/features/inventory/api-client-consignment"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}

interface ReceiveConsignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  medicines: Medicine[]
  suppliers: Supplier[]
  /** Called after stock is received so the page can refresh its positions. */
  onReceived: () => void | Promise<void>
}

/** Receive supplier-owned stock. Posts no purchase or payable — that happens on settlement. */
export function ReceiveConsignmentDialog({ open, onOpenChange, medicines, suppliers, onReceived }: ReceiveConsignmentDialogProps) {
  const { toast } = useToast()
  const [medicineId, setMedicineId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [rackLocation, setRackLocation] = useState("")
  const [receiving, setReceiving] = useState(false)
  /** "+ New medicine": the name typed so far, while the short medicine form is open. */
  const [newMedicineName, setNewMedicineName] = useState<string | null>(null)
  /** Medicines added from here, until the page's list refreshes. */
  const [added, setAdded] = useState<{ id: string; name: string }[]>([])
  /** One Idempotency-Key per receipt, reused when the same receipt is submitted again. */
  const receiveKeys = useRef(createIdempotencyKeyTracker())

  // Start every open from a clean form.
  useEffect(() => {
    if (!open) return
    setMedicineId("")
    setSupplierId("")
    setQuantity("")
    setUnitCost("")
    setBatchNumber("")
    setExpiryDate("")
    setRackLocation("")
  }, [open])

  const handleReceive = async () => {
    const qty = Number(quantity)
    const cost = Number(unitCost)
    if (!medicineId || !supplierId || !(qty > 0) || !(cost >= 0) || unitCost === "") {
      toast({ title: "Select a medicine, supplier, quantity and unit cost", variant: "destructive" })
      return
    }
    setReceiving(true)
    try {
      const receipt = {
        medicine_id: medicineId,
        supplier_id: supplierId,
        quantity: qty,
        unit_cost: cost,
        batch_number: batchNumber.trim() || null,
        expiry_date: expiryDate || null,
        rack_location: rackLocation.trim() || null,
      }
      const { error } = await consignmentApi.receive(receipt, receiveKeys.current.keyFor(JSON.stringify(receipt)))
      if (error) throw new Error(error)
      receiveKeys.current.reset()
      toast({ title: "Consignment stock received", description: "On the shelf and sellable — no payable posted until it sells." })
      onOpenChange(false)
      await onReceived()
    } catch (error) {
      toast({ title: "Receive failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setReceiving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !receiving && onOpenChange(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive consignment stock</DialogTitle>
            <DialogDescription>
              The stock becomes sellable immediately. No purchase or payable is posted until you settle.
            </DialogDescription>
          </DialogHeader>
          <form
            id="receive-consignment-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void handleReceive()
            }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consignment-medicine">
                  Medicine <RequiredMark />
                </Label>
                <MedicineCombobox
                  id="consignment-medicine"
                  medicines={[...added.filter((a) => !medicines.some((m) => m.id === a.id)), ...medicines]}
                  value={medicineId}
                  onValueChange={setMedicineId}
                  placeholder="Select medicine..."
                  onCreateNew={(text) => setNewMedicineName(text)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consignment-supplier">
                  Supplier <RequiredMark />
                </Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="consignment-supplier" aria-required="true">
                    <SelectValue placeholder="Select supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consignment-qty">
                  Quantity <RequiredMark />
                </Label>
                <Input
                  id="consignment-qty"
                  type="number"
                  min={1}
                  required
                  className="num"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="consignment-cost">
                  Unit cost (NPR) <RequiredMark />
                </Label>
                <Input
                  id="consignment-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  className="num"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  aria-describedby="consignment-cost-hint"
                />
                <p id="consignment-cost-hint" className="text-xs text-muted-foreground">
                  Agreed price you pay the supplier per unit sold.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="consignment-batch">Batch no. (optional)</Label>
                <Input
                  id="consignment-batch"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  aria-describedby="consignment-batch-hint"
                />
                <p id="consignment-batch-hint" className="text-xs text-muted-foreground">
                  As printed on the pack — used for recalls and expiry tracking.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="consignment-expiry">Expiry date (optional)</Label>
                <DatePicker id="consignment-expiry" value={expiryDate} onChange={setExpiryDate} presets={EXPIRY_PRESETS} allowFuture clearable />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="consignment-rack">Shelf location (optional)</Label>
                <Input
                  id="consignment-rack"
                  value={rackLocation}
                  onChange={(e) => setRackLocation(e.target.value)}
                  placeholder="e.g. Rack 3"
                />
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={receiving}>
              Cancel
            </Button>
            <Button type="submit" form="receive-consignment-form" loading={receiving} loadingText="Receiving…">
              {!receiving && <PackagePlus aria-hidden />}
              Receive stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateMedicineModal
        isOpen={newMedicineName !== null}
        onClose={() => setNewMedicineName(null)}
        onCreate={(medicine) => {
          if (medicine) {
            setAdded((prev) => [...prev, medicine])
            setMedicineId(medicine.id)
          }
          setNewMedicineName(null)
        }}
        initialName={newMedicineName ?? undefined}
        cardOnly
      />
    </>
  )
}
