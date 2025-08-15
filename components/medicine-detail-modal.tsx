"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Calendar, Package, DollarSign, AlertTriangle, Clock, Pill } from "lucide-react"

interface Medicine {
  id: string
  name: string
  generic_name: string
  brand_name: string
  dosage: string
  form: string
  strength: string
  unit_price: string
  cost_price: string
  stock_quantity: number
  minimum_stock: number
  maximum_stock: number
  expiry_date: string
  prescription_required: boolean
  barcode: string | null
  side_effects: string | null
  storage_instructions: string | null
  categories: { name: string } | null
  suppliers: { name: string } | null
}

interface MedicineDetailModalProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
}

export default function MedicineDetailModal({ medicine, isOpen, onClose }: MedicineDetailModalProps) {
  if (!medicine) return null

  const currentDate = new Date()
  const expiryDate = new Date(medicine.expiry_date)
  const isExpired = expiryDate < currentDate
  const isExpiringSoon = expiryDate <= new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  const getStockStatus = () => {
    if (medicine.stock_quantity === 0) return { label: "Out of Stock", variant: "destructive" as const }
    if (medicine.stock_quantity <= medicine.minimum_stock) return { label: "Low Stock", variant: "secondary" as const }
    return { label: "In Stock", variant: "default" as const }
  }

  const stockStatus = getStockStatus()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            {medicine.name}
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
                  ${Number.parseFloat(medicine.unit_price).toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Unit Price</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  ${Number.parseFloat(medicine.cost_price).toFixed(2)}
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
                  <div className="font-medium">{expiryDate.toLocaleDateString()}</div>
                  <div className="text-sm text-gray-600">Expiry Date</div>
                </div>
                <div>
                  {isExpired && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Expired
                    </Badge>
                  )}
                  {!isExpired && isExpiringSoon && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expiring Soon
                    </Badge>
                  )}
                </div>
              </div>
            </div>
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
