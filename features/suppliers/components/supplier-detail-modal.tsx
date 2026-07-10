"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Truck, Phone, Mail, MapPin, Package, Calendar, Plus } from "lucide-react"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import { CurrencyDisplay } from "@/components/currency-display"
import { medicinesApi } from "@/features/medicines/api-client"

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  reconciliation_account_ref?: string | null
  created_at: string
}

interface SupplierDetailModalProps {
  supplier: Supplier | null
  isOpen: boolean
  onClose: () => void
}

export default function SupplierDetailModal({ supplier, isOpen, onClose }: SupplierDetailModalProps) {
  const [medicines, setMedicines] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreateMedicineOpen, setIsCreateMedicineOpen] = useState(false)

  useEffect(() => {
    if (supplier && isOpen) {
      loadSupplierMedicines()
    }
  }, [supplier, isOpen])

  const loadSupplierMedicines = async () => {
    if (!supplier) return

    setIsLoading(true)
    try {
      const { data, error } = await medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" })
      if (error) throw new Error(error)
      setMedicines((data || []).filter((m) => m.supplier_id === supplier.id))
    } catch (error) {
      console.error("Error loading supplier medicines:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!supplier) return null

  const getSupplierStatus = () => {
    const hasCompleteInfo = supplier.email && supplier.phone && supplier.contact_person
    return hasCompleteInfo
      ? { label: "Active", variant: "default" as const }
      : { label: "Incomplete", variant: "secondary" as const }
  }

  const status = getSupplierStatus()
  const totalMedicines = medicines.length
  const lowStockMedicines = medicines.filter((m) => m.stock_quantity <= m.minimum_stock).length

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {supplier.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3">Contact Information</h3>
              <div className="space-y-3">
                {supplier.contact_person && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                    </div>
                    <span className="font-medium">Contact Person:</span> {supplier.contact_person}
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {supplier.email}
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {supplier.phone}
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {supplier.address}
                  </div>
                )}
              </div>
            </div>
                       <div>
              <h3 className="font-semibold mb-3">Supplier Details</h3>
              <div className="space-y-3">
                {supplier.reconciliation_account_ref ? (
                  <div className="text-sm">
                    <span className="font-medium">Statement ref:</span>{" "}
                    <span className="font-mono">{supplier.reconciliation_account_ref}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No statement reference on file.</p>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">Added:</span> {new Date(supplier.created_at).toLocaleDateString()}
                </div>
                <div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Statistics */}
          <div>
            <h3 className="font-semibold mb-3">Supply Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Package className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold text-blue-600">{totalMedicines}</div>
                <div className="text-sm text-gray-600">Total Medicines</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{lowStockMedicines}</div>
                <div className="text-sm text-gray-600">Low Stock Items</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {totalMedicines > 0 ? Math.round(((totalMedicines - lowStockMedicines) / totalMedicines) * 100) : 0}%
                </div>
                <div className="text-sm text-gray-600">Stock Health</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Supplied Medicines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Supplied Medicines</h3>
              <Button
                size="sm"
                onClick={() => setIsCreateMedicineOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Medicine
              </Button>
            </div>
            {isLoading ? (
              <div className="text-center py-4">Loading medicines...</div>
            ) : medicines.length > 0 ? (
              <div className="rounded-lg border max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Min Stock</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {medicines.map((medicine) => {
                      const isLowStock = medicine.stock_quantity <= medicine.minimum_stock
                      const isOutOfStock = medicine.stock_quantity === 0

                      return (
                        <TableRow key={medicine.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{medicine.name}</div>
                              <div className="text-sm text-gray-500">
                                {medicine.strength} • {medicine.form}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{medicine.stock_quantity}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{medicine.minimum_stock}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-green-600">
                              <CurrencyDisplay amount={medicine.unit_price} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "default"}>
                              {isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No medicines supplied by this supplier</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
      
      {/* Create Medicine Modal with pre-filled supplier */}
      <CreateMedicineModal
        isOpen={isCreateMedicineOpen}
        onClose={() => setIsCreateMedicineOpen(false)}
        onCreate={() => {
          setIsCreateMedicineOpen(false)
          loadSupplierMedicines()
        }}
        initialSupplierId={supplier?.id}
      />
    </Dialog>
  )
}
