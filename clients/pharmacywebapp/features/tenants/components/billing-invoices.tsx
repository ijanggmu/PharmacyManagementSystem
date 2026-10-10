"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Ban, CheckCircle2, Download, FileText, Play, Receipt, Send } from "lucide-react"
import { tenantsApi } from "@/features/tenants/api-client"
import type { Invoice } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { useDebounce } from "@/lib/utils/performance"

const PAGE_SIZE = 20
const STATUS_OPTIONS = ["Draft", "Issued", "Paid", "Void"] as const
const INVOICE_STATUS_NAMES: Record<number, string> = { 0: "Draft", 1: "Issued", 2: "Paid", 3: "Void" }

function errorMessage(error: unknown): string {
  return error instanceof DotnetApiError ? error.normalized.message : "Request failed"
}

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

type ConfirmAction = { kind: "pay" | "void"; invoice: Invoice } | null

export function BillingInvoices() {
  const [pageNumber, setPageNumber] = useState(1)
  const [tenantId, setTenantId] = useState("")
  const [status, setStatus] = useState<string>("all")

  const [data, setData] = useState<{ items: Invoice[]; totalCount: number; totalPages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateYear, setGenerateYear] = useState(String(new Date().getFullYear()))
  const [generateMonth, setGenerateMonth] = useState(String(new Date().getMonth() + 1))
  const [generateBusy, setGenerateBusy] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateResult, setGenerateResult] = useState<number | null>(null)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [voidReason, setVoidReason] = useState("")

  // The tenant box filters as you type: debounce it, and drop responses that arrive after a newer
  // request was sent, so a slow earlier query can't overwrite the results of the latest filter.
  const debouncedTenantId = useDebounce(tenantId.trim(), 300)
  const requestSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setLoadError(null)
    try {
      const page = await tenantsApi.listInvoicesAdmin(
        {
          tenantId: debouncedTenantId || undefined,
          status: status === "all" ? undefined : (status as Invoice["status"]),
        },
        pageNumber,
        PAGE_SIZE,
      )
      if (seq !== requestSeq.current) return
      setData({ items: [...page.items], totalCount: page.totalCount, totalPages: page.totalPages })
    } catch (err) {
      if (seq !== requestSeq.current) return
      setLoadError(errorMessage(err))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [debouncedTenantId, status, pageNumber])

  useEffect(() => {
    void load()
  }, [load])

  const refreshAfterAction = async () => {
    await load()
  }

  const onIssue = async (invoice: Invoice) => {
    setActionError(null)
    setActionBusyId(invoice.id)
    try {
      await tenantsApi.issueInvoice(invoice.id)
      await refreshAfterAction()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  const onConfirm = async () => {
    if (!confirmAction) return
    setActionError(null)
    setActionBusyId(confirmAction.invoice.id)
    try {
      if (confirmAction.kind === "pay") {
        await tenantsApi.payInvoice(confirmAction.invoice.id)
      } else {
        await tenantsApi.voidInvoice(confirmAction.invoice.id, voidReason.trim() || null)
      }
      setConfirmAction(null)
      setVoidReason("")
      await refreshAfterAction()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  const onGenerate = async () => {
    setGenerateError(null)
    const year = Number(generateYear)
    const month = Number(generateMonth)
    if (!Number.isInteger(year) || year < 2000) return setGenerateError("Enter a valid year.")
    if (!Number.isInteger(month) || month < 1 || month > 12) return setGenerateError("Enter a month from 1 to 12.")
    setGenerateBusy(true)
    try {
      const result = await tenantsApi.generateInvoices(year, month)
      setGenerateResult(result.generated)
      await refreshAfterAction()
    } catch (err) {
      setGenerateError(errorMessage(err))
    } finally {
      setGenerateBusy(false)
    }
  }

  const totalItems = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1
  const startIndex = (pageNumber - 1) * PAGE_SIZE

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="font-display text-base">Invoices</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Issue, pay, void or batch-generate invoices across tenants.</p>
        </div>
        <Button
          onClick={() => {
            setGenerateError(null)
            setGenerateResult(null)
            setGenerateOpen(true)
          }}
          className="w-full sm:w-auto"
        >
          <Play aria-hidden />
          Generate for period
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-tenant-filter" className="text-xs text-muted-foreground">
              Tenant ID
            </Label>
            <Input
              id="invoice-tenant-filter"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value)
                setPageNumber(1)
              }}
              placeholder="all tenants"
              className="w-48 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-status-filter" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value)
                setPageNumber(1)
              }}
            >
              <SelectTrigger id="invoice-status-filter" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {actionError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {loading && !data ? (
          <SkeletonTable rows={6} cols={7} />
        ) : loadError && !data ? (
          <ErrorState size="compact" title="Couldn't load invoices" message={loadError} onRetry={() => void load()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState size="compact" icon={Receipt} title="No invoices match these filters" description="Try a different tenant or status, or generate a new batch." />
        ) : (
          <>
            {loadError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((invoice) => {
                    const name = invoiceStatusName(invoice.status)
                    const busy = actionBusyId === invoice.id
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{invoice.tenantId}</TableCell>
                        <TableCell>
                          {invoice.periodYear}-{String(invoice.periodMonth).padStart(2, "0")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoiceStatusVariant(invoice.status)}>{name}</Badge>
                        </TableCell>
                        <TableCell className="num text-right">{formatMoney(invoice.subtotalAmount, invoice.currency)}</TableCell>
                        <TableCell className="num text-muted-foreground">{formatDate(invoice.dueAtUtc)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {name === "Draft" && (
                              <Button variant="ghost" size="sm" onClick={() => onIssue(invoice)} loading={busy} aria-label={`Issue ${invoice.invoiceNumber}`}>
                                <Send aria-hidden />
                                Issue
                              </Button>
                            )}
                            {name === "Issued" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmAction({ kind: "pay", invoice })}
                                aria-label={`Mark ${invoice.invoiceNumber} paid`}
                              >
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
                                  setConfirmAction({ kind: "void", invoice })
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
            <Pagination
              currentPage={pageNumber}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={PAGE_SIZE}
              startIndex={startIndex}
              onPageChange={setPageNumber}
              className="mt-4"
            />
          </>
        )}
      </CardContent>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => void onConfirm()}
        title={confirmAction?.kind === "pay" ? "Mark invoice paid?" : "Void this invoice?"}
        description={
          confirmAction?.kind === "pay" ? (
            <>Mark invoice {confirmAction.invoice.invoiceNumber} as paid. This records a manual payment with no payment processor involved.</>
          ) : (
            <div className="space-y-3">
              <p>
                Voiding invoice {confirmAction?.invoice.invoiceNumber} cannot be undone. {confirmAction?.invoice ? invoiceStatusName(confirmAction.invoice.status) : ""} invoices become permanently
                void.
              </p>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="void-reason">Reason (optional)</Label>
                <Textarea id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={2} />
              </div>
            </div>
          )
        }
        confirmText={confirmAction?.kind === "pay" ? "Mark paid" : "Void invoice"}
        variant={confirmAction?.kind === "void" ? "destructive" : "default"}
        loading={actionBusyId !== null}
      />

      <Dialog open={generateOpen} onOpenChange={(open) => (generateBusy ? null : setGenerateOpen(open))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate invoices for a period</DialogTitle>
            <DialogDescription>
              Creates one invoice per active tenant for the given billing period. Re-running a period that already has invoices skips those tenants.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {generateError ? (
              <Alert variant="destructive">
                <AlertDescription>{generateError}</AlertDescription>
              </Alert>
            ) : null}
            {generateResult !== null ? (
              <Alert>
                <AlertDescription>
                  <FileText className="mr-1 inline h-4 w-4" aria-hidden />
                  Generated {generateResult} invoice{generateResult === 1 ? "" : "s"}.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="generate-year">Year</Label>
                <Input id="generate-year" type="number" value={generateYear} onChange={(e) => setGenerateYear(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generate-month">Month</Label>
                <Input id="generate-month" type="number" min="1" max="12" value={generateMonth} onChange={(e) => setGenerateMonth(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGenerateOpen(false)} disabled={generateBusy}>
              Close
            </Button>
            <Button type="button" onClick={() => void onGenerate()} loading={generateBusy} loadingText="Generating…">
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
