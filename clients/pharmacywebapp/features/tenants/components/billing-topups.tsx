"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Ban, CheckCircle2, Clock, Wallet } from "lucide-react"
import { tenantsApi } from "@/features/tenants/api-client"
import type { TopupRequest } from "@/features/tenants/types"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { useDebounce } from "@/lib/utils/performance"

const PAGE_SIZE = 20
const STATUS_OPTIONS = ["Pending", "Invoiced", "Completed", "Rejected", "Cancelled"] as const

function errorMessage(error: unknown): string {
  return error instanceof DotnetApiError ? error.normalized.message : "Request failed"
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

function statusVariant(status: string): "success" | "warning" | "muted" | "danger" {
  if (status === "Completed" || status === "Invoiced") return "success"
  if (status === "Pending") return "warning"
  if (status === "Rejected") return "danger"
  return "muted"
}

type ConfirmAction = { kind: "approve" | "reject"; request: TopupRequest } | null

export function BillingTopups() {
  const [pageNumber, setPageNumber] = useState(1)
  const [tenantId, setTenantId] = useState("")
  const [status, setStatus] = useState<string>("Pending")

  const [data, setData] = useState<{ items: TopupRequest[]; totalCount: number; totalPages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [note, setNote] = useState("")

  // The tenant box filters as you type: debounce it, and drop responses that arrive after a newer
  // request was sent, so a slow earlier query can't overwrite the results of the latest filter.
  const debouncedTenantId = useDebounce(tenantId.trim(), 300)
  const requestSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setLoadError(null)
    try {
      const page = await tenantsApi.listTopupRequests(
        { tenantId: debouncedTenantId || undefined, status: status === "all" ? undefined : status },
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

  const onConfirm = async () => {
    if (!confirmAction) return
    setActionError(null)
    setBusyId(confirmAction.request.id)
    try {
      if (confirmAction.kind === "approve") {
        await tenantsApi.approveTopupRequest(confirmAction.request.id, note.trim() || null)
      } else {
        await tenantsApi.rejectTopupRequest(confirmAction.request.id, note.trim() || null)
      }
      setConfirmAction(null)
      setNote("")
      await load()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const totalItems = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1
  const startIndex = (pageNumber - 1) * PAGE_SIZE

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Wallet top-up requests</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Approve to invoice the top-up, or reject with a note.</p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="topup-tenant-filter" className="text-xs text-muted-foreground">
              Tenant ID
            </Label>
            <Input
              id="topup-tenant-filter"
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
            <Label htmlFor="topup-status-filter" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value)
                setPageNumber(1)
              }}
            >
              <SelectTrigger id="topup-status-filter" className="w-40">
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
          <SkeletonTable rows={5} cols={6} />
        ) : loadError && !data ? (
          <ErrorState size="compact" title="Couldn't load top-up requests" message={loadError} onRetry={() => void load()} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState size="compact" icon={Wallet} title="No top-up requests" description="No wallet top-up requests match these filters." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((request) => {
                    const busy = busyId === request.id
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{request.tenantId}</TableCell>
                        <TableCell className="num text-right">{formatMoney(request.amount, request.currency)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={request.note ?? undefined}>
                          {request.note ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(request.status)}>
                            {request.status === "Pending" && <Clock aria-hidden />}
                            {request.status === "Completed" || request.status === "Invoiced" ? <CheckCircle2 aria-hidden /> : null}
                            {request.status === "Rejected" && <Ban aria-hidden />}
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="num text-muted-foreground">{formatDate(request.createdAtUtc)}</TableCell>
                        <TableCell className="text-right">
                          {request.status === "Pending" ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={busy}
                                onClick={() => {
                                  setNote("")
                                  setConfirmAction({ kind: "approve", request })
                                }}
                                aria-label={`Approve top-up for ${request.tenantId}`}
                              >
                                <CheckCircle2 aria-hidden />
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={busy}
                                onClick={() => {
                                  setNote("")
                                  setConfirmAction({ kind: "reject", request })
                                }}
                                aria-label={`Reject top-up for ${request.tenantId}`}
                              >
                                <Ban aria-hidden />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{request.decisionNote ?? "—"}</span>
                          )}
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
        title={confirmAction?.kind === "approve" ? "Approve this top-up?" : "Reject this top-up?"}
        description={
          <div className="space-y-3">
            <p>
              {confirmAction?.kind === "approve"
                ? `This issues an invoice for ${confirmAction ? formatMoney(confirmAction.request.amount, confirmAction.request.currency) : ""} to tenant ${confirmAction?.request.tenantId}.`
                : `Tenant ${confirmAction?.request.tenantId}'s top-up request will be rejected. This cannot be undone.`}
            </p>
            <div className="space-y-1.5 text-left">
              <Label htmlFor="topup-note">{confirmAction?.kind === "approve" ? "Note (optional)" : "Reason (optional)"}</Label>
              <Textarea id="topup-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
          </div>
        }
        confirmText={confirmAction?.kind === "approve" ? "Approve" : "Reject"}
        variant={confirmAction?.kind === "reject" ? "destructive" : "default"}
        loading={busyId !== null}
      />
    </Card>
  )
}
