"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle2, CircleDashed, Clock, FileText, Pill, Stethoscope, User } from "lucide-react"
import { Prescription, PrescriptionItem } from "@/features/prescriptions/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { getPrescriptionStatus } from "./prescription-status"

interface PrescriptionDetailModalProps {
  prescription: Prescription | null
  isOpen: boolean
  onClose: () => void
}

/** Fields some older records carry that aren't on the typed list row. */
type PrescriptionWithLegacy = Prescription & { doctor_license?: string | null; issue_date?: string | null }

function itemFillState(item: PrescriptionItem) {
  if (item.quantity_dispensed >= item.quantity_prescribed) {
    return { label: "Complete", variant: "success" as const, icon: CheckCircle2 }
  }
  if (item.quantity_dispensed > 0) {
    return { label: "Partial", variant: "info" as const, icon: CircleDashed }
  }
  return { label: "Not dispensed", variant: "warning" as const, icon: Clock }
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

export default function PrescriptionDetailModal({ prescription, isOpen, onClose }: PrescriptionDetailModalProps) {
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (prescription && isOpen) {
      loadPrescriptionItems()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescription, isOpen])

  const loadPrescriptionItems = async () => {
    if (!prescription) return

    setIsLoading(true)
    try {
      const { data, error } = await prescriptionsApi.getPrescription(prescription.id)
      if (error) throw new Error(error)
      setPrescriptionItems(data?.[0]?.prescription_items || [])
    } catch (error) {
      console.error("Error loading prescription items:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!prescription) return null

  const rx = prescription as PrescriptionWithLegacy
  const statusBadge = getPrescriptionStatus(prescription.status)
  const StatusIcon = statusBadge.icon
  const patientName = prescription.customers
    ? `${prescription.customers.first_name} ${prescription.customers.last_name}`.trim()
    : "—"
  const totalPrescribed = prescriptionItems.reduce((s, i) => s + i.quantity_prescribed, 0)
  const totalDispensed = prescriptionItems.reduce((s, i) => s + i.quantity_dispensed, 0)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden />
            <span className="num">Prescription #{prescription.prescription_number}</span>
            <Badge variant={statusBadge.variant}>
              <StatusIcon aria-hidden />
              {statusBadge.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Patient + prescriber */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="rounded-lg border p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <User className="h-4 w-4 text-muted-foreground" aria-hidden />
                Patient
              </h3>
              <dl className="divide-y">
                <DetailRow label="Name">{patientName}</DetailRow>
                {prescription.customers?.phone && (
                  <DetailRow label="Phone">
                    <span className="num">{prescription.customers.phone}</span>
                  </DetailRow>
                )}
              </dl>
            </section>
            <section className="rounded-lg border p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Stethoscope className="h-4 w-4 text-muted-foreground" aria-hidden />
                Prescriber
              </h3>
              <dl className="divide-y">
                <DetailRow label="Doctor">{prescription.doctor_name || "—"}</DetailRow>
                {rx.doctor_license && <DetailRow label="License no.">{rx.doctor_license}</DetailRow>}
              </dl>
            </section>
          </div>

          <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd className="num font-medium">{new Date(rx.issue_date || prescription.prescribed_date).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valid until</dt>
              <dd className="num font-medium">
                {prescription.expiry_date ? new Date(prescription.expiry_date).toLocaleDateString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Dispensed / prescribed</dt>
              <dd className="num font-medium">
                {isLoading ? "…" : `${totalDispensed} / ${totalPrescribed} units`}
              </dd>
            </div>
          </dl>

          <Separator />

          {/* Prescription Items */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Pill className="h-4 w-4 text-muted-foreground" aria-hidden />
              Prescribed medicines
            </h3>
            {isLoading ? (
              <div className="space-y-2" role="status" aria-label="Loading medicines">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : prescriptionItems.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead className="text-right">Prescribed</TableHead>
                      <TableHead className="text-right">Dispensed</TableHead>
                      <TableHead>Dosage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prescriptionItems.map((item) => {
                      const fill = itemFillState(item)
                      const FillIcon = fill.icon
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.medicines?.name || "Unknown medicine"}</div>
                            {(item.medicines?.strength || item.medicines?.form) && (
                              <div className="text-xs text-muted-foreground">
                                {[item.medicines?.strength, item.medicines?.form].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="num text-right font-medium">{item.quantity_prescribed}</TableCell>
                          <TableCell className="num text-right font-medium">{item.quantity_dispensed}</TableCell>
                          <TableCell className="max-w-[220px] text-sm">
                            {item.dosage_instructions ? (
                              <span className="line-clamp-2" title={item.dosage_instructions}>
                                {item.dosage_instructions}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No specific instructions</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={fill.variant}>
                              <FillIcon aria-hidden />
                              {fill.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No medicines recorded on this prescription.
              </p>
            )}
          </section>

          {/* Notes */}
          {prescription.notes && (
            <section>
              <h3 className="mb-2 font-semibold">Notes</h3>
              <div className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{prescription.notes}</div>
            </section>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
