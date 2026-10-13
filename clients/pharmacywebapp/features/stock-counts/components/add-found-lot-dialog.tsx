"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { medicinesApi } from "@/features/medicines/api-client"
import type { StockCountEntry } from "@/features/stock-counts/api-client"
import { parseCountInput } from "@/features/stock-counts/lib/stock-count"

const NEW_LOT = "__new__"

interface AddFoundLotDialogProps {
  /** Medicine already identified (e.g. by a scanned barcode); null = search for it here. */
  initialMedicine: { id: string; name: string } | null
  saving: boolean
  onClose: () => void
  onSave: (entry: StockCountEntry) => void
}

/**
 * A lot found on the shelf that isn't on the count sheet: an existing lot of the medicine (e.g. one that had
 * no stock when counting started), or a batch the system doesn't know at all — created when the count is posted.
 */
export function AddFoundLotDialog({ initialMedicine, saving, onClose, onSave }: AddFoundLotDialogProps) {
  const [medicine, setMedicine] = useState(initialMedicine)
  const [search, setSearch] = useState("")
  const [batchChoice, setBatchChoice] = useState<string>(NEW_LOT)
  const [batchNo, setBatchNo] = useState("")
  const [expiry, setExpiry] = useState("")
  const [rack, setRack] = useState("")
  const [quantity, setQuantity] = useState("")

  const results = useQuery({
    queryKey: ["stock-counts", "found-lot-search", search.trim()],
    queryFn: () => medicinesApi.getMedicines({ search: search.trim(), limit: 8 }),
    enabled: !medicine && search.trim().length >= 2,
  })
  const batches = useQuery({
    queryKey: ["stock-counts", "found-lot-batches", medicine?.id],
    queryFn: () => medicinesApi.getMedicineBatches(medicine!.id),
    enabled: !!medicine,
  })

  const counted = parseCountInput(quantity)
  const isNew = batchChoice === NEW_LOT
  const valid = !!medicine && typeof counted === "number" && (isNew ? batchNo.trim() !== "" : true)

  const save = () => {
    if (!medicine || typeof counted !== "number") return
    onSave({
      lineId: null,
      countedQuantity: counted,
      medicineId: medicine.id,
      batchId: isNew ? null : batchChoice,
      batchNo: isNew ? batchNo.trim() : null,
      expiryDate: isNew && expiry ? expiry : null,
      rackLocation: rack.trim() || null,
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Found a lot</DialogTitle>
          <DialogDescription>Stock on the shelf that isn&apos;t on this count sheet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {medicine ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="font-medium">{medicine.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setMedicine(null)} disabled={saving}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="found-search">Medicine</Label>
              <Input id="found-search" autoFocus placeholder="Search by name or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-48 overflow-y-auto rounded-md border empty:hidden">
                {(results.data?.data ?? []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setMedicine({ id: m.id, name: [m.name, m.strength].filter(Boolean).join(" ") })
                      setBatchChoice(NEW_LOT)
                    }}
                  >
                    {m.name} {m.strength}
                  </button>
                ))}
              </div>
            </div>
          )}

          {medicine && (
            <div className="space-y-1.5">
              <Label>Batch</Label>
              <Select value={batchChoice} onValueChange={setBatchChoice}>
                <SelectTrigger aria-label="Batch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_LOT}>A batch the system doesn&apos;t have</SelectItem>
                  {(batches.data?.data ?? [])
                    .filter((b) => !b.is_disposed)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.batch_number} · exp {b.expiry_date?.slice(0, 10) ?? "—"} · {b.quantity_remaining} in system
                        {b.branches ? ` · ${b.branches.name}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {medicine && isNew && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="found-batch">Batch number</Label>
                <Input id="found-batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} maxLength={64} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="found-expiry">Expiry</Label>
                <Input id="found-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
            </div>
          )}

          {medicine && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="found-qty">Counted quantity</Label>
                <Input id="found-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="found-rack">Rack (optional)</Label>
                <Input id="found-rack" value={rack} onChange={(e) => setRack(e.target.value)} maxLength={64} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || saving} loading={saving} loadingText="Saving…">
            Add to count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
