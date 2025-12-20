"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, User, Stethoscope, Calendar, Package } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Prescription } from "@/lib/api/prescriptions"

interface PrescriptionDetailModalProps {
  prescription: Prescription | null
  isOpen: boolean
  onClose: () => void
}

export default function PrescriptionDetailModal({ prescription, isOpen, onClose }: PrescriptionDetailModalProps) {
  const [prescriptionItems, setPrescriptionItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (prescription && isOpen) {
      loadPrescriptionItems()
    }
  }, [prescription, isOpen])

  const loadPrescriptionItems = async () => {
    if (!prescription) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const { data, error } = await supabase
        .from("prescription_items")
        .select(`
          *,
          medicines (
            name,
            strength,
            form,
            unit_price
          )
        `)
        .eq("prescription_id", prescription.id)

      if (error) throw error
      setPrescriptionItems(data || [])
    } catch (error) {
      console.error("Error loading prescription items:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!prescription) return null

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "filled":
        return { label: "Filled", variant: "default" as const }
      case "partially_filled":
        return { label: "Partially Filled", variant: "outline" as const }
      case "cancelled":
        return { label: "Cancelled", variant: "destructive" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const statusBadge = getStatusBadge(prescription.status)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Prescription #{prescription.prescription_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Patient Information
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Name:</span> {prescription.customers?.first_name}{" "}
                  {prescription.customers?.last_name}
                </div>
                {prescription.customers?.phone && (
                  <div>
                    <span className="font-medium">Phone:</span> {prescription.customers.phone}
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Doctor Information
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Doctor:</span> {prescription.doctor_name}
                </div>
                {(prescription as any).doctor_license && (
                  <div>
                    <span className="font-medium">License:</span> {(prescription as any).doctor_license}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Prescription Details */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <Calendar className="h-6 w-6 mx-auto mb-2 text-blue-600" />
              <div className="font-medium">{new Date((prescription as any).issue_date || prescription.prescribed_date).toLocaleDateString()}</div>
              <div className="text-sm text-gray-600">Issue Date</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="mb-2">
                <Badge variant={statusBadge.variant} className="text-sm">
                  {statusBadge.label}
                </Badge>
              </div>
              <div className="text-sm text-gray-600">Status</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <Package className="h-6 w-6 mx-auto mb-2 text-green-600" />
              <div className="font-medium">{prescriptionItems.length}</div>
              <div className="text-sm text-gray-600">Medications</div>
            </div>
          </div>

          <Separator />

          {/* Prescription Items */}
          <div>
            <h3 className="font-semibold mb-3">Prescribed Medications</h3>
            {isLoading ? (
              <div className="text-center py-4">Loading medications...</div>
            ) : prescriptionItems.length > 0 ? (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medication</TableHead>
                      <TableHead>Prescribed</TableHead>
                      <TableHead>Dispensed</TableHead>
                      <TableHead>Instructions</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptionItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.medicines?.name}</div>
                            <div className="text-sm text-gray-500">
                              {item.medicines?.strength} • {item.medicines?.form}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.quantity_prescribed}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.quantity_dispensed}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{item.instructions || "No specific instructions"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.quantity_dispensed >= item.quantity_prescribed
                                ? "default"
                                : item.quantity_dispensed > 0
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {item.quantity_dispensed >= item.quantity_prescribed
                              ? "Complete"
                              : item.quantity_dispensed > 0
                                ? "Partial"
                                : "Pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No medications found</p>
            )}
          </div>

          {/* Notes */}
          {prescription.notes && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Notes</h3>
                <div className="p-3 bg-gray-50 rounded-lg text-sm">{prescription.notes}</div>
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
