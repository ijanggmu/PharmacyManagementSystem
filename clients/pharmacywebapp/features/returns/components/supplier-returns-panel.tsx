"use client"

/**
 * Debit notes (returns to suppliers), across every supplier by default. A debit note is final the
 * moment it is posted (stock out, payable down by cost + VAT), so the only actions are view and print.
 */

import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronLeft, ChevronRight, FileText, PackageX, Printer, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useSupplierOptions } from "@/features/suppliers/hooks/use-supplier-options"
import { useMedicine } from "@/features/medicines/hooks/use-medicines"
import { supplierReturnsApi } from "@/features/suppliers/api-client-returns"
import { supplierReturnTotal, type DotnetSupplierReturnDto } from "@/lib/api/suppliers-api"
import { usePrintDebitNote } from "@/features/returns/hooks/use-print-debit-note"
import { returnReasonLabel } from "@/features/returns/lib/debit-note-print"
import { useCurrency } from "@/lib/contexts/currency-context"
import { formatDate } from "@/lib/utils/formatting"
import { cn } from "@/lib/utils"
import { supplierReturnsKeys } from "@/features/returns/lib/supplier-return-cache"

const PAGE_SIZE = 20
const ALL = "all"

// Defined beside the post-return invalidation so both stay in step; re-exported for existing imports.
export { supplierReturnsKeys }

interface SupplierReturnsPanelProps {
  onNewReturn: () => void
  /** Branch scope; undefined = the server's default for this user. */
  branchId?: string
}

export function SupplierReturnsPanel({ onNewReturn, branchId }: SupplierReturnsPanelProps) {
  const { formatCurrency } = useCurrency()
  const { print, printingId } = usePrintDebitNote()
  const [supplierId, setSupplierId] = useState(ALL)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Inactive suppliers too: past debit notes to a since-deactivated supplier must stay reachable.
  const suppliersQuery = useSupplierOptions({ includeInactive: true })
  const suppliers = suppliersQuery.options

  const selectSupplier = (id: string) => {
    setSupplierId(id)
    setPage(1)
    setExpanded(null)
  }

  const filterId = supplierId === ALL ? "" : supplierId
  const returnsQuery = useQuery({
    queryKey: supplierReturnsKeys.list(filterId, page, branchId),
    queryFn: () => supplierReturnsApi.list(filterId, { page, limit: PAGE_SIZE, branchId }),
  })

  const rows = returnsQuery.data?.data ?? []
  const total = returnsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const loadError = returnsQuery.data?.error ?? (returnsQuery.error instanceof Error ? returnsQuery.error.message : null)
  const supplierName = (r: DotnetSupplierReturnDto) =>
    r.supplierName ?? suppliers.find((s) => s.id === r.supplierId)?.name ?? "Supplier"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-1.5 sm:max-w-xs">
          <Label htmlFor="supplier-returns-supplier">Supplier</Label>
          <Select value={supplierId} onValueChange={selectSupplier}>
            <SelectTrigger id="supplier-returns-supplier" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="num font-medium text-foreground">{total}</span> {total === 1 ? "debit note" : "debit notes"}
          </p>
        )}
      </div>

      {returnsQuery.isLoading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : loadError ? (
        <ErrorState
          size="compact"
          title="We couldn't load debit notes"
          message={loadError}
          onRetry={() => returnsQuery.refetch()}
          retrying={returnsQuery.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={PackageX}
          title={supplierId === ALL ? "No supplier returns yet" : "No returns to this supplier yet"}
          description="When you send expired, damaged or wrong goods back, post a debit note so stock, payables and the VAT return stay right."
          action={{ label: "New supplier return", onClick: onNewReturn, icon: Truck }}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Expand</span>
                  </TableHead>
                  <TableHead>Debit note</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Total debit</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Print</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isOpen = expanded === r.id
                  const units = r.items.reduce((sum, i) => sum + i.quantity, 0)
                  return (
                    <Fragment key={r.id}>
                      <TableRow className={cn(isOpen && "bg-muted/30")}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            aria-expanded={isOpen}
                            aria-controls={`sr-lines-${r.id}`}
                            aria-label={isOpen ? "Hide returned items" : "Show returned items"}
                          >
                            <ChevronDown className={cn("transition-transform duration-200", isOpen && "rotate-180")} aria-hidden />
                          </Button>
                        </TableCell>
                        <TableCell>
                          {r.documentNumber ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-sm font-medium text-primary">
                              <FileText className="h-3.5 w-3.5" aria-hidden />
                              {r.documentNumber}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unnumbered</span>
                          )}
                          {r.supplierInvoiceNumber && (
                            <p className="text-xs text-muted-foreground">
                              Bill <span className="font-mono">{r.supplierInvoiceNumber}</span>
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-medium">{supplierName(r)}</TableCell>
                        <TableCell className="num whitespace-nowrap">{formatDate(r.returnDateUtc)}</TableCell>
                        <TableCell className="num text-right">
                          {r.items.length} <span className="text-muted-foreground">({units} units)</span>
                        </TableCell>
                        <TableCell className="num text-right text-muted-foreground">
                          {r.vatAmount ? formatCurrency(r.vatAmount) : "—"}
                        </TableCell>
                        <TableCell className="num text-right font-semibold">{formatCurrency(supplierReturnTotal(r))}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => void print(r.id)}
                            disabled={printingId === r.id}
                            aria-label={`Print debit note ${r.documentNumber ?? ""}`.trim()}
                            title="Print debit note"
                          >
                            <Printer className={cn(printingId === r.id && "animate-pulse")} aria-hidden />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow id={`sr-lines-${r.id}`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={8} className="whitespace-normal p-0">
                            <ReturnLines debitNote={r} formatCurrency={formatCurrency} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label="Debit note pages">
              <p className="text-sm text-muted-foreground">
                Page <span className="num">{page}</span> of <span className="num">{totalPages}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

function ReturnLines({
  debitNote,
  formatCurrency,
}: {
  debitNote: DotnetSupplierReturnDto
  formatCurrency: (amount: number) => string
}) {
  return (
    <div className="space-y-3 px-4 py-3 sm:pl-14">
      <ul className="divide-y rounded-md border bg-card">
        {debitNote.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              {item.medicineName ? (
                <p className="truncate font-medium text-foreground">{item.medicineName}</p>
              ) : (
                <LegacyMedicineName id={item.medicineId} />
              )}
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="muted">{returnReasonLabel(item.returnReason)}</Badge>
                {item.batchNo && (
                  <span>
                    Batch <span className="font-mono">{item.batchNo}</span>
                  </span>
                )}
                {item.notes && <span>— {item.notes}</span>}
              </p>
            </div>
            <p className="num text-muted-foreground sm:w-40 sm:text-right">
              {item.quantity} × {formatCurrency(item.unitCost)}
            </p>
            <p className="num font-medium sm:w-28 sm:text-right">{formatCurrency(item.totalCost + (item.vatAmount ?? 0))}</p>
          </li>
        ))}
      </ul>
      {debitNote.notes && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Remarks:</span> {debitNote.notes}
        </p>
      )}
    </div>
  )
}

/** Returns recorded before names were kept carry only a medicine id. */
function LegacyMedicineName({ id }: { id: string }) {
  const { data, isLoading } = useMedicine(id)
  if (isLoading) return <span className="inline-block h-4 w-40 animate-pulse rounded bg-muted" aria-label="Loading medicine name" />
  return <p className="truncate font-medium text-foreground">{data?.data?.name ?? "Unknown medicine"}</p>
}
