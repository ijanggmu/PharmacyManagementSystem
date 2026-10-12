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
import { Customer, customersApi } from "@/features/customers/api-client"
import { completedSales, countLabel, DETAIL_LIST_LIMIT } from "@/features/customers/lib/customer-detail"
import type { CustomerSummary } from "@/lib/api/customers-api"
import { CurrencyDisplay } from "@/components/currency-display"
import { prescriptionsApi, type Prescription } from "@/features/prescriptions/api-client"
import { salesApi, type Sale } from "@/features/sales/api-client"

interface CustomerDetailModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
  /** Shows an Edit button in the footer that hands the customer back to the owner's edit flow. */
  onEdit?: (customer: Customer) => void
}

/** Customer profile in the standard right-side details panel, split into tabs. */
export default function CustomerDetailModal({ customer, isOpen, onClose, onEdit }: CustomerDetailModalProps) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [prescriptionsTotal, setPrescriptionsTotal] = useState<number | null>(null)
  const [prescriptionsError, setPrescriptionsError] = useState<string | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [salesError, setSalesError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CustomerSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!customer || !isOpen) return

    // Ignore a slow response for a customer the user has already moved away from.
    let cancelled = false
    setPrescriptions([])
    setPrescriptionsTotal(null)
    setPrescriptionsError(null)
    setSales([])
    setSalesError(null)
    setSummary(null)
    setSummaryError(null)
    setIsLoading(true)

    // No branchId: every branch the user may view (a customer's history is not per branch).
    Promise.all([
      prescriptionsApi.getPrescriptions({ customerId: customer.id, limit: DETAIL_LIST_LIMIT }),
      salesApi.getSales({ customerId: customer.id, limit: DETAIL_LIST_LIMIT }),
      customersApi.getSummary(customer.id),
    ])
      .then(([prescriptionsResult, salesResult, summaryResult]) => {
        if (cancelled) return
        if (prescriptionsResult.error) {
          setPrescriptionsError(prescriptionsResult.error)
        } else {
          setPrescriptions(prescriptionsResult.data || [])
          setPrescriptionsTotal(prescriptionsResult.total ?? null)
        }
        if (salesResult.error) setSalesError(salesResult.error)
        else setSales(completedSales(salesResult.data || []))
        if (summaryResult.error) setSummaryError(summaryResult.error)
        else setSummary(summaryResult.data)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "Failed to load customer data"
        setPrescriptionsError(message)
        setSalesError(message)
        setSummaryError(message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [customer, isOpen, reloadKey])

  if (!customer) return null

  const retry = () => setReloadKey((k) => k + 1)
  const fullName = `${customer.first_name} ${customer.last_name}`.trim()
  // Totals come from the server (completed sales across branches, every prescription), never from the
  // capped lists below. Without them the counts fall back to the rows fetched ("100+" when capped).
  const prescriptionCount = countLabel(summary?.prescriptionCount, prescriptions.length, prescriptionsTotal)
  const purchaseCount = countLabel(summary?.purchaseCount, sales.length)
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
              <TabCount loading={isLoading} count={prescriptionsError && !summary ? "!" : prescriptionCount} />
            </TabsTrigger>
            <TabsTrigger value="purchases">
              <ShoppingCart aria-hidden />
              Purchases
              <TabCount loading={isLoading} count={salesError && !summary ? "!" : purchaseCount} />
            </TabsTrigger>
            <TabsTrigger value="loyalty">
              <Gift aria-hidden />
              Loyalty
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Prescriptions"
                value={summary ? summary.prescriptionCount : prescriptionsError ? "—" : prescriptionCount}
                icon={FileText}
                tone="info"
                loading={isLoading}
              />
              <StatCard
                label="Purchases"
                value={summary ? summary.purchaseCount : salesError ? "—" : purchaseCount}
                icon={ShoppingCart}
                tone="primary"
                loading={isLoading}
              />
              <StatCard
                label="Total spent"
                value={summary ? <CurrencyDisplay amount={summary.totalSpent.toFixed(2)} /> : "—"}
                icon={Wallet}
                tone="success"
                loading={isLoading}
              />
            </div>
            {!isLoading && summaryError && (
              <LoadError message={`Couldn't load this customer's totals: ${summaryError}`} onRetry={retry} />
            )}

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
            ) : prescriptionsError ? (
              <LoadError message={`Couldn't load prescriptions: ${prescriptionsError}`} onRetry={retry} />
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
                <CappedNote shown={prescriptions.length} total={summary?.prescriptionCount ?? prescriptionsTotal} />
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
            ) : salesError ? (
              <LoadError message={`Couldn't load purchases: ${salesError}`} onRetry={retry} />
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
                <CappedNote shown={sales.length} total={summary?.purchaseCount ?? null} />
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

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm"
    >
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <span>{message}</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

/** Shown under a list that hit its row cap, so a partial list is not mistaken for the whole history. */
function CappedNote({ shown, total }: { shown: number; total: number | null | undefined }) {
  const more = typeof total === "number" && total > shown
  if (!more && shown < DETAIL_LIST_LIMIT) return null
  return (
    <li className="num px-1 text-xs text-muted-foreground">
      Showing the latest {shown}
      {more ? ` of ${total}` : "+"}.
    </li>
  )
}

function TabCount({ loading, count }: { loading: boolean; count: number | string }) {
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
