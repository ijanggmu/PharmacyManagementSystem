"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonCard } from "@/components/ui/skeleton"
import { Ban, CheckCircle2, CreditCard, Download, Receipt, Send } from "lucide-react"
import { SubscriptionStatusBadge } from "@/features/tenants/components/tenant-management"
import { tenantsApi } from "@/features/tenants/api-client"
import type { Invoice, PagedResponse, Subscription } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"

const INVOICE_PAGE_SIZE = 10

const INVOICE_STATUS_NAMES: Record<number, string> = { 0: "Draft", 1: "Issued", 2: "Paid", 3: "Void" }

function invoiceStatusName(status: Invoice["status"]): string {
  return typeof status === "number" ? INVOICE_STATUS_NAMES[status] ?? "Draft" : status
}

function invoiceStatusVariant(status: Invoice["status"]): "success" | "warning" | "muted" | "danger" {
  const name = invoiceStatusName(status)
  if (name === "Paid") return "success"
  if (name === "Issued") return "warning"
  if (name === "Void") return "danger"
  return "muted"
}

function formatDate(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString()
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function errorMessage(error: unknown): string {
  return error instanceof DotnetApiError ? error.normalized.message : "Request failed"
}

/**
 * Billing section for the tenant overview page: current plan + subscription status/dates from the
 * Billing module (distinct from the Multitenancy tenant row's own plan key + validUpto — the
 * subscription is the authoritative billing state), plus the last few invoices.
 */
export function TenantBilling({ tenantId }: { tenantId: string }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)

  const [invoices, setInvoices] = useState<PagedResponse<Invoice> | null>(null)
  const [invoicePage, setInvoicePage] = useState(1)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null)
  const [voidReason, setVoidReason] = useState("")

  useEffect(() => {
    let cancelled = false
    setSubscriptionLoading(true)
    tenantsApi
      .getSubscription(tenantId)
      .then((sub) => {
        if (!cancelled) setSubscription(sub)
      })
      .catch((err: unknown) => {
        if (!cancelled) setSubscriptionError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setSubscriptionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true)
    try {
      setInvoices(await tenantsApi.listInvoices(tenantId, INVOICE_PAGE_SIZE, invoicePage))
      setInvoicesError(null)
    } catch (err) {
      setInvoicesError(errorMessage(err))
    } finally {
      setInvoicesLoading(false)
    }
  }, [tenantId, invoicePage])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  const onIssue = async (invoice: Invoice) => {
    setActionError(null)
    setActionBusyId(invoice.id)
    try {
      await tenantsApi.issueInvoice(invoice.id)
      await loadInvoices()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  const onPay = async (invoice: Invoice) => {
    setActionError(null)
    setActionBusyId(invoice.id)
    try {
      await tenantsApi.payInvoice(invoice.id)
      await loadInvoices()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  const onVoid = async () => {
    if (!voidTarget) return
    setActionError(null)
    setActionBusyId(voidTarget.id)
    try {
      await tenantsApi.voidInvoice(voidTarget.id, voidReason.trim() || null)
      setVoidTarget(null)
      setVoidReason("")
      await loadInvoices()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Billing</CardTitle>
          <CardDescription>Current plan and subscription from the billing module.</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptionLoading ? (
            <SkeletonCard />
          ) : subscriptionError ? (
            <ErrorState size="compact" title="Couldn't load the subscription" message={subscriptionError} />
          ) : !subscription ? (
            <EmptyState
              size="compact"
              icon={CreditCard}
              title="No subscription on record"
              description="This tenant has no subscription row in the Billing module yet."
            />
          ) : (
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm text-muted-foreground">Plan</dt>
                <dd className="mt-1 font-medium">{subscription.planName}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd className="mt-1">
                  <SubscriptionStatusBadge status={subscription.status} />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Started</dt>
                <dd className="num mt-1 font-medium">{formatDate(subscription.startUtc)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{subscription.endUtc ? "Ends" : "Renews"}</dt>
                <dd className="num mt-1 font-medium">{formatDate(subscription.endUtc)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-base">Invoices</CardTitle>
            <CardDescription>Every invoice issued to this tenant, newest first.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/tenants/billing">Billing admin</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {actionError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          {invoicesLoading ? (
            <SkeletonCard />
          ) : invoicesError ? (
            <ErrorState size="compact" title="Couldn't load invoices" message={invoicesError} onRetry={() => void loadInvoices()} />
          ) : !invoices || invoices.items.length === 0 ? (
            <EmptyState size="compact" icon={Receipt} title="No invoices yet" description="No invoice has been issued for this tenant." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.items.map((invoice) => {
                    const name = invoiceStatusName(invoice.status)
                    const busy = actionBusyId === invoice.id
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          {invoice.periodYear}-{String(invoice.periodMonth).padStart(2, "0")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoiceStatusVariant(invoice.status)}>{name}</Badge>
                        </TableCell>
                        <TableCell className="num text-right">{formatMoney(invoice.subtotalAmount, invoice.currency)}</TableCell>
                        <TableCell className="num text-muted-foreground">{formatDate(invoice.issuedAtUtc)}</TableCell>
                        <TableCell className="num text-muted-foreground">{formatDate(invoice.paidAtUtc)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {name === "Draft" && (
                              <Button variant="ghost" size="sm" loading={busy} onClick={() => void onIssue(invoice)} aria-label={`Issue ${invoice.invoiceNumber}`}>
                                <Send aria-hidden />
                                Issue
                              </Button>
                            )}
                            {name === "Issued" && (
                              <Button variant="ghost" size="sm" loading={busy} onClick={() => void onPay(invoice)} aria-label={`Mark ${invoice.invoiceNumber} paid`}>
                                <CheckCircle2 aria-hidden />
                                Pay
                              </Button>
                            )}
                            {(name === "Draft" || name === "Issued") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setVoidReason("")
                                  setVoidTarget(invoice)
                                }}
                                aria-label={`Void ${invoice.invoiceNumber}`}
                              >
                                <Ban aria-hidden />
                                Void
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" asChild aria-label={`Download ${invoice.invoiceNumber} as PDF`}>
                              <a href={tenantsApi.invoicePdfUrl(invoice.id)} target="_blank" rel="noopener noreferrer">
                                <Download aria-hidden />
                                PDF
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {invoices && !invoicesError ? (
            <Pagination
              currentPage={invoicePage}
              totalPages={invoices.totalPages}
              totalItems={invoices.totalCount}
              itemsPerPage={INVOICE_PAGE_SIZE}
              startIndex={(invoicePage - 1) * INVOICE_PAGE_SIZE}
              onPageChange={setInvoicePage}
              className="mt-4"
            />
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        onConfirm={() => void onVoid()}
        title="Void this invoice?"
        description={
          <div className="space-y-3">
            <p>Voiding invoice {voidTarget?.invoiceNumber} cannot be undone.</p>
            <div className="space-y-1.5 text-left">
              <Label htmlFor="tenant-void-reason">Reason (optional)</Label>
              <Textarea id="tenant-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={2} />
            </div>
          </div>
        }
        confirmText="Void invoice"
        variant="destructive"
        loading={actionBusyId !== null}
      />
    </div>
  )
}
