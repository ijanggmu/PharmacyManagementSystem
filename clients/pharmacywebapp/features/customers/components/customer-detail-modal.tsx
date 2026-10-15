"use client"

import { creditTermsLabel } from "@/lib/utils/payment-terms"
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
  ReceiptText,
  ShoppingCart,
  UserRound,
  Wallet,
} from "lucide-react"
import { CustomerCardDialog } from "./customer-card-dialog"
import { CreditMeter } from "./credit-meter"
import { CustomerLoyaltyPanel } from "./customer-loyalty-panel"
import { CustomerStatementPanel } from "./customer-statement-panel"
import { useCustomerPermissions } from "@/features/customers/hooks/use-customer-permissions"
import { StatCard } from "@/components/shared/stat-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Customer, customersApi } from "@/features/customers/api-client"
import { completedSales, countLabel, DETAIL_LIST_LIMIT } from "@/features/customers/lib/customer-detail"
import type { CustomerSummary } from "@/lib/api/customers-api"
import { CurrencyDisplay } from "@/components/currency-display"
import { SendDuesReminderButton } from "@/features/sms/components/send-dues-reminder-button"
import { prescriptionsApi, type Prescription } from "@/features/prescriptions/api-client"
import { salesApi, type Sale } from "@/features/sales/api-client"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"

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
  const t = useTranslations("customers")
  const { formatBsDate, formatNumber } = useI18n()
  const { canViewMoney } = useCustomerPermissions()

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
        const message = error instanceof Error ? error.message : t("detail.loadFailed")
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
        srTitle={t("detail.srTitle", { name: fullName })}
        size="lg"
        badges={
          <>
            {customer.is_active === false ? <Badge variant="muted">{t("detail.inactive")}</Badge> : <Badge variant="success">{t("detail.active")}</Badge>}
            {customer.is_member && (
              <Badge variant="info">
                <Gift aria-hidden />
                {t("detail.member")}
              </Badge>
            )}
          </>
        }
        description={
          <span className="num">
            {customer.code && <span className="font-mono font-medium text-foreground">{customer.code}</span>}
            {customer.code && " · "}
            {t("detail.customerSince", { date: formatBsDate(customer.created_at) })}
          </span>
        }
        headerActions={
          <Button type="button" variant="outline" size="sm" onClick={() => setCardOpen(true)} disabled={!customer.code}>
            <CreditCard aria-hidden />
            {t("detail.customerCard")}
          </Button>
        }
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              {t("detail.close")}
            </Button>
            {onEdit && (
              <Button onClick={() => onEdit(customer)}>
                <Pencil aria-hidden />
                {t("detail.edit")}
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
              <span className="font-semibold text-destructive">{t("detail.allergies")} </span>
              {customer.allergies!.join(", ")}
            </p>
          </div>
        )}

        {/* key resets to the Overview tab when a different customer is opened. */}
        <Tabs key={customer.id} defaultValue="overview" className="gap-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">
              <UserRound aria-hidden />
              {t("detail.overview")}
            </TabsTrigger>
            <TabsTrigger value="prescriptions">
              <FileText aria-hidden />
              {t("detail.prescriptions")}
              <TabCount loading={isLoading} count={prescriptionsError && !summary ? "!" : prescriptionCount} />
            </TabsTrigger>
            <TabsTrigger value="purchases">
              <ShoppingCart aria-hidden />
              {t("detail.purchases")}
              <TabCount loading={isLoading} count={salesError && !summary ? "!" : purchaseCount} />
            </TabsTrigger>
            <TabsTrigger value="loyalty">
              <Gift aria-hidden />
              {t("detail.loyalty")}
            </TabsTrigger>
            {canViewMoney && (
              <TabsTrigger value="statement">
                <ReceiptText aria-hidden />
                {t("statement.tab")}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label={t("detail.prescriptions")}
                value={summary ? formatNumber(summary.prescriptionCount) : prescriptionsError ? "—" : prescriptionCount}
                icon={FileText}
                tone="info"
                loading={isLoading}
              />
              <StatCard
                label={t("detail.purchases")}
                value={summary ? formatNumber(summary.purchaseCount) : salesError ? "—" : purchaseCount}
                icon={ShoppingCart}
                tone="primary"
                loading={isLoading}
              />
              <StatCard
                label={t("detail.totalSpent")}
                value={summary ? <CurrencyDisplay amount={summary.totalSpent.toFixed(2)} /> : "—"}
                icon={Wallet}
                tone="success"
                loading={isLoading}
              />
            </div>
            {!isLoading && summaryError && (
              <LoadError message={t("detail.totalsError", { error: summaryError })} onRetry={retry} />
            )}

            <DetailSection title={t("detail.creditAccount")}>
              <div className="rounded-lg border p-4">
                <CreditMeter balance={customer.current_balance ?? 0} creditLimit={customer.credit_limit} />
                <p className="mt-1 text-xs text-muted-foreground">{t("detail.paymentTerms", { terms: creditTermsLabel(customer.credit_days) })}</p>
                {(customer.current_balance ?? 0) > 0.005 && (
                  <div className="mt-3">
                    <SendDuesReminderButton customerId={customer.id} customerName={customer.first_name} />
                  </div>
                )}
              </div>
            </DetailSection>

            <DetailSection title={t("detail.contact")}>
              <DetailFields>
                <DetailField label={t("detail.phone")} mono>
                  {customer.phone}
                </DetailField>
                <DetailField label={t("detail.sms")}>
                  {customer.sms_consent ? t("detail.smsAgreed") : t("detail.smsNone")}
                </DetailField>
                <DetailField label={t("detail.email")}>{customer.email}</DetailField>
                <DetailField label={t("detail.address")} className="sm:col-span-2">
                  {customer.address}
                </DetailField>
              </DetailFields>
            </DetailSection>

            <DetailSection title={t("detail.personalMedical")}>
              <DetailFields>
                <DetailField label={t("detail.dateOfBirth")}>
                  {customer.date_of_birth && (
                    <span className="num">
                      {formatBsDate(customer.date_of_birth)}
                      {age !== null && <span className="text-muted-foreground"> {t("detail.years", { age: formatNumber(age) })}</span>}
                    </span>
                  )}
                </DetailField>
                <DetailField label={t("detail.insurance")}>
                  {customer.insurance_provider &&
                    [customer.insurance_provider, customer.insurance_number].filter(Boolean).join(" · ")}
                </DetailField>
                <DetailField label={t("detail.chronicConditions")} className="sm:col-span-2">
                  {customer.chronic_conditions?.length ? customer.chronic_conditions.join(", ") : null}
                </DetailField>
                <DetailField label={t("detail.currentMedications")} className="sm:col-span-2">
                  {customer.current_medications?.length ? customer.current_medications.join(", ") : null}
                </DetailField>
              </DetailFields>
            </DetailSection>
          </TabsContent>

          <TabsContent value="prescriptions">
            {isLoading ? (
              <ListSkeleton />
            ) : prescriptionsError ? (
              <LoadError message={t("detail.prescriptionsError", { error: prescriptionsError })} onRetry={retry} />
            ) : prescriptions.length > 0 ? (
              <ul className="space-y-2">
                {prescriptions.map((prescription) => (
                  <li key={prescription.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="num font-medium">{prescription.prescription_number}</div>
                        <div className="truncate text-sm text-muted-foreground">Dr. {prescription.doctor_name}</div>
                        <div className="num text-sm text-muted-foreground">
                          {t("detail.items", { count: formatNumber(prescription.prescription_items?.length || 0) })}
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
                          {formatBsDate(prescription.created_at)}
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
                title={t("detail.noPrescriptions")}
                description={t("detail.noPrescriptionsDescription")}
              />
            )}
          </TabsContent>

          <TabsContent value="purchases">
            {isLoading ? (
              <ListSkeleton />
            ) : salesError ? (
              <LoadError message={t("detail.purchasesError", { error: salesError })} onRetry={retry} />
            ) : sales.length > 0 ? (
              <ul className="space-y-2">
                {sales.map((sale) => (
                  <li key={sale.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="num font-medium">{t("detail.saleNo", { number: sale.sale_number ?? sale.id.slice(0, 8) })}</div>
                        <div className="text-sm capitalize text-muted-foreground">{t("detail.paidBy", { method: sale.payment_method })}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num font-semibold">
                          <CurrencyDisplay amount={Number.parseFloat(sale.total_amount).toFixed(2)} />
                        </div>
                        <div className="num text-sm text-muted-foreground">
                          {formatBsDate(sale.created_at)}
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
                title={t("detail.noPurchases")}
                description={t("detail.noPurchasesDescription")}
              />
            )}
          </TabsContent>

          <TabsContent value="loyalty">
            <CustomerLoyaltyPanel customerId={customer.id} />
          </TabsContent>

          {canViewMoney && (
            <TabsContent value="statement">
              <CustomerStatementPanel customerId={customer.id} customerAddress={customer.address} />
            </TabsContent>
          )}
        </Tabs>
      </DetailSheet>
      <CustomerCardDialog customer={customer} open={cardOpen} onClose={() => setCardOpen(false)} />
    </>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations("customers")
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
        {t("detail.retry")}
      </Button>
    </div>
  )
}

/** Shown under a list that hit its row cap, so a partial list is not mistaken for the whole history. */
function CappedNote({ shown, total }: { shown: number; total: number | null | undefined }) {
  const t = useTranslations("customers")
  const { formatNumber } = useI18n()
  const more = typeof total === "number" && total > shown
  if (!more && shown < DETAIL_LIST_LIMIT) return null
  return (
    <li className="num px-1 text-xs text-muted-foreground">
      {t("detail.showingLatest", { shown: formatNumber(shown) })}
      {more ? t("detail.ofTotal", { total: formatNumber(total) }) : "+"}.
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
