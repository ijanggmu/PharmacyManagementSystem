"use client"

import { useState, useEffect } from "react"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  AlertTriangle,
  CreditCard,
  FileText,
  Gift,
  Pencil,
  ShoppingCart,
  UserRound,
  Wallet,
} from "lucide-react"
import { CustomerCardDialog } from "./customer-card-dialog"
import { CreditMeter } from "./credit-meter"
import { CustomerLoyaltyPanel } from "./customer-loyalty-panel"
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
  /** Shows an Edit button in the footer that hands the customer back to the owner's edit flow. */
  onEdit?: (customer: Customer) => void
}

/** Customer profile in the standard right-side details panel, split into tabs. */
export default function CustomerDetailModal({ customer, isOpen, onClose, onEdit }: CustomerDetailModalProps) {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [cardOpen, setCardOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!customer || !isOpen) return

    // Ignore a slow response for a customer the user has already moved away from.
    let cancelled = false
    setPrescriptions([])
    setSales([])
    setIsLoading(true)

    Promise.all([
      prescriptionsApi.getPrescriptions({ customerId: customer.id, limit: 100 }),
      salesApi.getSales({ customerId: customer.id, limit: 100 }),
    ])
      .then(([prescriptionsResult, salesResult]) => {
        if (cancelled) return
        if (!prescriptionsResult.error) setPrescriptions(prescriptionsResult.data || [])
        if (!salesResult.error) setSales(salesResult.data || [])
      })
      .catch((error) => console.error("Error loading customer data:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [customer, isOpen])

  if (!customer) return null

  const fullName = `${customer.first_name} ${customer.last_name}`.trim()
  const totalSpent = sales.reduce((sum, sale) => sum + Number.parseFloat(sale.total_amount), 0)
  const age = customer.date_of_birth
    ? Math.floor((new Date().getTime() - new Date(customer.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null
  const hasAllergies = !!customer.allergies && customer.allergies.length > 0

  return (
    <>
      <DetailSheet
        open={isOpen}
        onOpenChange={(open) => !open && onClose()}
        title={fullName}
        srTitle={`Customer ${fullName}`}
        size="lg"
        badges={
          <>
            {customer.is_active === false ? <Badge variant="muted">Inactive</Badge> : <Badge variant="success">Active</Badge>}
            {customer.is_member && (
              <Badge variant="info">
                <Gift aria-hidden />
                Member
              </Badge>
            )}
          </>
        }
        description={
          <span className="num">
            {customer.code && <span className="font-mono font-medium text-foreground">{customer.code}</span>}
            {customer.code && " · "}
            Customer since {new Date(customer.created_at).toLocaleDateString()}
          </span>
        }
        headerActions={
          <Button type="button" variant="outline" size="sm" onClick={() => setCardOpen(true)} disabled={!customer.code}>
            <CreditCard aria-hidden />
            Customer card
          </Button>
        }
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {onEdit && (
              <Button onClick={() => onEdit(customer)}>
                <Pencil aria-hidden />
                Edit customer
              </Button>
            )}
          </>
        }
      >
        {/* Allergies stay above the tabs: staff must see them whichever tab is open. */}
        {hasAllergies && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p>
              <span className="font-semibold text-destructive">Allergies: </span>
              {customer.allergies!.join(", ")}
            </p>
          </div>
        )}

        {/* key resets to the Overview tab when a different customer is opened. */}
        <Tabs key={customer.id} defaultValue="overview" className="gap-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">
              <UserRound aria-hidden />
              Overview
            </TabsTrigger>
            <TabsTrigger value="prescriptions">
              <FileText aria-hidden />
              Prescriptions
              <TabCount loading={isLoading} count={prescriptions.length} />
            </TabsTrigger>
            <TabsTrigger value="purchases">
              <ShoppingCart aria-hidden />
              Purchases
              <TabCount loading={isLoading} count={sales.length} />
            </TabsTrigger>
            <TabsTrigger value="loyalty">
              <Gift aria-hidden />
              Loyalty
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
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

            <DetailSection title="Credit account">
              <div className="rounded-lg border p-4">
                <CreditMeter balance={customer.current_balance ?? 0} creditLimit={customer.credit_limit} />
              </div>
            </DetailSection>

            <DetailSection title="Contact">
              <DetailFields>
                <DetailField label="Phone" mono>
                  {customer.phone}
                </DetailField>
                <DetailField label="Email">{customer.email}</DetailField>
                <DetailField label="Address" className="sm:col-span-2">
                  {customer.address}
                </DetailField>
              </DetailFields>
            </DetailSection>

            <DetailSection title="Personal & medical">
              <DetailFields>
                <DetailField label="Date of birth">
                  {customer.date_of_birth && (
                    <span className="num">
                      {new Date(customer.date_of_birth).toLocaleDateString()}
                      {age !== null && <span className="text-muted-foreground"> ({age} yrs)</span>}
                    </span>
                  )}
                </DetailField>
                <DetailField label="Insurance">
                  {customer.insurance_provider &&
                    [customer.insurance_provider, customer.insurance_number].filter(Boolean).join(" · ")}
                </DetailField>
                <DetailField label="Chronic conditions" className="sm:col-span-2">
                  {customer.chronic_conditions?.length ? customer.chronic_conditions.join(", ") : null}
                </DetailField>
                <DetailField label="Current medications" className="sm:col-span-2">
                  {customer.current_medications?.length ? customer.current_medications.join(", ") : null}
                </DetailField>
              </DetailFields>
            </DetailSection>
          </TabsContent>

          <TabsContent value="prescriptions">
            {isLoading ? (
              <ListSkeleton />
            ) : prescriptions.length > 0 ? (
              <ul className="space-y-2">
                {prescriptions.map((prescription) => (
                  <li key={prescription.id} className="rounded-lg border bg-muted/30 p-3">
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
              <EmptyState
                size="compact"
                icon={FileText}
                title="No prescriptions yet"
                description="Prescriptions recorded for this customer will appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="purchases">
            {isLoading ? (
              <ListSkeleton />
            ) : sales.length > 0 ? (
              <ul className="space-y-2">
                {sales.map((sale) => (
                  <li key={sale.id} className="rounded-lg border bg-muted/30 p-3">
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
              <EmptyState
                size="compact"
                icon={ShoppingCart}
                title="No purchases yet"
                description="Sales made to this customer will appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="loyalty">
            <CustomerLoyaltyPanel customerId={customer.id} />
          </TabsContent>
        </Tabs>
      </DetailSheet>
      <CustomerCardDialog customer={customer} open={cardOpen} onClose={() => setCardOpen(false)} />
    </>
  )
}

function TabCount({ loading, count }: { loading: boolean; count: number }) {
  if (loading) return null
  return (
    <span className="num rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}
