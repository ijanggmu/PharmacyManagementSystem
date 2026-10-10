"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { User, Phone, Mail, MapPin, Calendar, ShoppingCart, FileText, AlertTriangle, Wallet } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Customer } from "@/features/customers/api-client"
import { CurrencyDisplay } from "@/components/currency-display"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { salesApi } from "@/features/sales/api-client"

interface CustomerDetailModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
}

export default function CustomerDetailModal({ customer, isOpen, onClose }: CustomerDetailModalProps) {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (customer && isOpen) {
      loadCustomerData()
    }
  }, [customer, isOpen])

  const loadCustomerData = async () => {
    if (!customer) return

    setIsLoading(true)
    try {
      const [prescriptionsResult, salesResult] = await Promise.all([
        prescriptionsApi.getPrescriptions({ customerId: customer.id, limit: 100 }),
        salesApi.getSales({ customerId: customer.id, limit: 100 }),
      ])

      if (!prescriptionsResult.error) setPrescriptions(prescriptionsResult.data || [])
      if (!salesResult.error) setSales(salesResult.data || [])
    } catch (error) {
      console.error("Error loading customer data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!customer) return null

  const totalSpent = sales.reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)
  const age = customer.date_of_birth
    ? Math.floor((new Date().getTime() - new Date(customer.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" aria-hidden />
            {customer.first_name} {customer.last_name}
          </DialogTitle>
          <DialogDescription className="num">
            Customer since {new Date(customer.created_at).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {customer.allergies && customer.allergies.length > 0 && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p>
                <span className="font-semibold text-destructive">Allergies: </span>
                {customer.allergies.join(", ")}
              </p>
            </div>
          )}

          {/* Basic Information */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold">Contact</h3>
              <div className="space-y-2">
                {customer.phone && (
                  <div className="num flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {customer.phone}
                  </div>
                )}
                {customer.email && (
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate" title={customer.email}>
                      {customer.email}
                    </span>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {customer.address}
                  </div>
                )}
                {!customer.phone && !customer.email && !customer.address && (
                  <p className="text-sm text-muted-foreground">No contact details on file.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Personal</h3>
              <div className="space-y-2">
                {customer.date_of_birth ? (
                  <div className="num flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {new Date(customer.date_of_birth).toLocaleDateString()}
                    {age && <span className="text-muted-foreground">({age} years old)</span>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Date of birth not recorded.</p>
                )}
                {customer.chronic_conditions && customer.chronic_conditions.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Conditions: </span>
                    {customer.chronic_conditions.join(", ")}
                  </p>
                )}
                {customer.current_medications && customer.current_medications.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Current medications: </span>
                    {customer.current_medications.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Statistics */}
          <div>
            <h3 className="sr-only">Customer statistics</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Prescriptions" value={prescriptions.length} icon={FileText} tone="info" loading={isLoading} />
              <StatCard label="Purchases" value={sales.length} icon={ShoppingCart} tone="primary" loading={isLoading} />
              <StatCard
                label="Total spent"
                value={<CurrencyDisplay amount={totalSpent.toFixed(2)} />}
                icon={Wallet}
                tone="success"
                loading={isLoading}
              />
            </div>
          </div>

          <Separator />

          {/* Recent Prescriptions */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              Recent prescriptions
            </h3>
            {isLoading ? (
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : prescriptions.length > 0 ? (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {prescriptions.slice(0, 5).map((prescription) => (
                  <li key={prescription.id} className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="num font-medium">{prescription.prescription_number}</div>
                        <div className="truncate text-sm text-muted-foreground">Dr. {prescription.doctor_name}</div>
                        <div className="num text-sm text-muted-foreground">
                          {prescription.prescription_items?.length || 0} items
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge
                          variant={
                            prescription.status === "filled"
                              ? "success"
                              : prescription.status === "pending" || prescription.status === "partially_filled"
                                ? "warning"
                                : "muted"
                          }
                          className="capitalize"
                        >
                          {String(prescription.status).replace(/_/g, " ")}
                        </Badge>
                        <div className="num mt-1 text-sm text-muted-foreground">
                          {new Date(prescription.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No prescriptions recorded for this customer yet.</p>
            )}
          </div>

          <Separator />

          {/* Recent Purchases */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden />
              Recent purchases
            </h3>
            {isLoading ? (
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : sales.length > 0 ? (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {sales.slice(0, 5).map((sale) => (
                  <li key={sale.id} className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="num font-medium">Sale #{sale.sale_number ?? sale.id.slice(0, 8)}</div>
                        <div className="text-sm capitalize text-muted-foreground">Paid by {sale.payment_method}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num font-semibold">
                          <CurrencyDisplay amount={Number.parseFloat(sale.total_amount).toFixed(2)} />
                        </div>
                        <div className="num text-sm text-muted-foreground">
                          {new Date(sale.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No purchases recorded for this customer yet.</p>
            )}
          </div>
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
