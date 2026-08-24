"use client"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Calendar, Package, DollarSign, AlertTriangle, Clock, Pill, Layers, Snowflake, Ban } from "lucide-react"
import { Medicine, medicinesApi } from "@/features/medicines/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { apiGet } from "@/lib/api/client-helpers"
import { useToast } from "@/hooks/use-toast"

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
  const { toast } = useToast()

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
      return
    }
    loadBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, medicine])

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

  if (!medicine) return null

  const currentDate = new Date()
  const expiryDate = medicine.expiry_date ? new Date(medicine.expiry_date) : null
  const isExpired = expiryDate ? expiryDate < currentDate : false
  const isExpiringSoon = expiryDate ? expiryDate <= new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000) : false

  const getStockStatus = () => {
    if (medicine.stock_quantity === 0) return { label: "Out of Stock", variant: "destructive" as const }
    if (medicine.stock_quantity <= medicine.minimum_stock) return { label: "Low Stock", variant: "secondary" as const }
    return { label: "In Stock", variant: "default" as const }
  }

  const stockStatus = getStockStatus()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            {medicine.name}
            {medicine.requires_cold_chain && (
              <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                <Snowflake className="h-3 w-3" />
                Cold Chain
                {(medicine.storage_temp_min_c != null || medicine.storage_temp_max_c != null) &&
                  ` ${medicine.storage_temp_min_c ?? "?"}–${medicine.storage_temp_max_c ?? "?"}°C`}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Basic Information</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Generic Name:</span> {medicine.generic_name || "N/A"}
                </div>
                <div>
                  <span className="font-medium">Brand Name:</span> {medicine.brand_name || "N/A"}
                </div>
                <div>
                  <span className="font-medium">Form:</span> {medicine.form}
                </div>
                <div>
                  <span className="font-medium">Strength:</span> {medicine.strength}
                </div>
                <div>
                  <span className="font-medium">Dosage:</span> {medicine.dosage}
                </div>
                {medicine.units_per_pack != null && (
                  <div>
                    <span className="font-medium">Pack size:</span> {medicine.units_per_pack} {medicine.unit_label || "unit(s)"}/pack
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Category & Supplier</h3>
              <div className="space-y-2">
                <Badge variant="outline">{medicine.categories?.name || "Uncategorized"}</Badge>
                <div className="text-sm">
                  <span className="font-medium">Supplier:</span> {medicine.suppliers?.name || "N/A"}
                </div>
                {medicine.barcode && (
                  <div className="text-sm">
                    <span className="font-medium">Barcode:</span> {medicine.barcode}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Stock Information */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stock Information
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">{medicine.stock_quantity}</div>
                <div className="text-sm text-gray-600">Current Stock</div>
                <Badge variant={stockStatus.variant} className="mt-1">
                  {stockStatus.label}
                </Badge>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">{medicine.minimum_stock}</div>
                <div className="text-sm text-gray-600">Minimum Stock</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">{medicine.maximum_stock}</div>
                <div className="text-sm text-gray-600">Maximum Stock</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Pricing Information */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pricing Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  <CurrencyDisplay amount={Number.parseFloat(medicine.unit_price).toFixed(2)} />
                </div>
                <div className="text-sm text-gray-600">Unit Price</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  <CurrencyDisplay amount={Number.parseFloat(medicine.cost_price).toFixed(2)} />
                </div>
                <div className="text-sm text-gray-600">Cost Price</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Expiry Information */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Expiry Information
            </h3>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {expiryDate ? expiryDate.toLocaleDateString() : "No expiry date set"}
                  </div>
                  <div className="text-sm text-gray-600">Expiry Date</div>
                </div>
                <div>
                  {expiryDate && isExpired && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Expired
                    </Badge>
                  )}
                  {expiryDate && !isExpired && isExpiringSoon && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expiring Soon
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Batches (FEFO) */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Batches
            </h3>
            {batchesLoading ? (
              <p className="text-sm text-muted-foreground">Loading batches…</p>
            ) : batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No batch records yet — batches are created whenever stock is added (Add Medicine, Bulk Import, Edit
                Medicine, or a purchase order receipt).
              </p>
            ) : (
              <div className="space-y-2">
                {batches.map((batch) => {
                  const batchExpiry = batch.expiry_date ? new Date(batch.expiry_date) : null
                  const batchExpired = batchExpiry ? batchExpiry < currentDate : false
                  const batchExpiringSoon = batchExpiry
                    ? batchExpiry <= new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                    : false
                  const isRecalled = !!batch.recalled_at
                  return (
                    <div key={batch.id} className="rounded-lg border p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{batch.batch_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {batch.branches?.name || "Branch"} · Received {new Date(batch.received_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {batch.selling_price != null && (
                            <div className="text-right">
                              <p className="font-semibold">
                                <CurrencyDisplay amount={Number(batch.selling_price)} />
                              </p>
                              <p className="text-xs text-muted-foreground">this batch's price</p>
                            </div>
                          )}
                          <div className="text-right">
                            <p className="font-semibold">
                              {batch.quantity_remaining} <span className="font-normal text-muted-foreground">/ {batch.quantity_received}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">remaining</p>
                          </div>
                          {isRecalled ? (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <Ban className="h-3 w-3" /> Recalled
                            </Badge>
                          ) : batchExpiry ? (
                            <Badge variant={batchExpired ? "destructive" : batchExpiringSoon ? "secondary" : "outline"}>
                              {batchExpiry.toLocaleDateString()}
                            </Badge>
                          ) : (
                            <Badge variant="outline">No expiry</Badge>
                          )}
                          {!isRecalled && recallTarget !== batch.batch_number && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setRecallTarget(batch.batch_number)
                                setRecallReason("")
                              }}
                            >
                              Recall
                            </Button>
                          )}
                        </div>
                      </div>
                      {isRecalled && batch.recall_reason && (
                        <p className="text-xs text-muted-foreground">Reason: {batch.recall_reason}</p>
                      )}
                      {recallTarget === batch.batch_number && (
                        <div className="flex items-center gap-2 pt-1 border-t">
                          <Input
                            value={recallReason}
                            onChange={(e) => setRecallReason(e.target.value)}
                            placeholder="Recall reason (e.g. supplier recall notice)"
                            className="h-8 text-xs"
                          />
                          <Button type="button" size="sm" variant="destructive" disabled={recalling} onClick={() => handleRecall(batch.batch_number)}>
                            Confirm
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setRecallTarget(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Additional Information */}
          {(medicine.side_effects || medicine.storage_instructions || medicine.prescription_required) && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Additional Information</h3>
                <div className="space-y-3">
                  {medicine.prescription_required && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      Prescription Required
                    </Badge>
                  )}
                  {medicine.side_effects && (
                    <div>
                      <span className="font-medium text-sm">Side Effects:</span>
                      <p className="text-sm text-gray-600 mt-1">{medicine.side_effects}</p>
                    </div>
                  )}
                  {medicine.storage_instructions && (
                    <div>
                      <span className="font-medium text-sm">Storage Instructions:</span>
                      <p className="text-sm text-gray-600 mt-1">{medicine.storage_instructions}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
