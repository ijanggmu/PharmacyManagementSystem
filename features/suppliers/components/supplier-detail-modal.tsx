"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Truck, Phone, Mail, MapPin, Package, Calendar, Plus, Upload, AlertTriangle, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import BulkMedicineImportModal from "@/features/medicines/components/bulk-medicine-import-modal"
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
  payable_amount?: number
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
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)

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
      ? { label: "Active", variant: "secondary" as const }
      : { label: "Incomplete", variant: "outline" as const }
  }

  const status = getSupplierStatus()
  const totalMedicines = medicines.length
  const lowStockMedicines = medicines.filter((m) => m.stock_quantity <= m.minimum_stock).length
  const stockHealth = totalMedicines > 0 ? Math.round(((totalMedicines - lowStockMedicines) / totalMedicines) * 100) : 0

  const contactRows = [
    supplier.contact_person && { icon: null, label: supplier.contact_person, dot: true },
    supplier.email && { icon: Mail, label: supplier.email },
    supplier.phone && { icon: Phone, label: supplier.phone },
    supplier.address && { icon: MapPin, label: supplier.address },
  ].filter(Boolean) as { icon: typeof Mail | null; label: string; dot?: boolean }[]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate">{supplier.name}</DialogTitle>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant={status.variant} className="text-[11px] font-normal">
                  {status.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Added {new Date(supplier.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Key metrics — flat, minimal tiles instead of heavy colored blocks */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                Payable
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                <CurrencyDisplay amount={Number(supplier.payable_amount ?? 0)} />
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Package className="h-3.5 w-3.5" aria-hidden />
                Medicines
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{totalMedicines}</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Low Stock
              </div>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  lowStockMedicines > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                )}
              >
                {lowStockMedicines}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Stock Health</div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stockHealth}%</p>
            </div>
          </div>

          <Separator />

          {/* Contact + reference, side by side, minimal list style */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</h3>
              <div className="mt-2 space-y-2">
                {contactRows.length > 0 ? (
                  contactRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {row.icon ? (
                        <row.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      )}
                      <span className="truncate">{row.label}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No contact details on file.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reference</h3>
              <div className="mt-2 space-y-2">
                {supplier.reconciliation_account_ref ? (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Statement ref </span>
                    <span className="font-mono">{supplier.reconciliation_account_ref}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No statement reference on file.</p>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  {new Date(supplier.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Supplied Medicines */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Supplied Medicines</h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsBulkImportOpen(true)} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Bulk Import
                </Button>
                <Button size="sm" onClick={() => setIsCreateMedicineOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Medicine
                </Button>
              </div>
            </div>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading medicines…</div>
            ) : medicines.length > 0 ? (
              <div className="max-h-60 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Min</TableHead>
                      <TableHead>Price</TableHead>
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
                            <div className="font-medium">{medicine.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {medicine.strength} • {medicine.form}
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">{medicine.stock_quantity}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{medicine.minimum_stock}</TableCell>
                          <TableCell className="tabular-nums font-medium">
                            <CurrencyDisplay amount={medicine.unit_price} />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "outline"}
                              className="text-[11px] font-normal"
                            >
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
              <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                No medicines supplied by this supplier yet.
              </div>
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

      {/* Bulk Import Modal with pre-filled supplier */}
      <BulkMedicineImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          setIsBulkImportOpen(false)
          loadSupplierMedicines()
        }}
        initialSupplierName={supplier?.name}
      />
    </Dialog>
  )
}
