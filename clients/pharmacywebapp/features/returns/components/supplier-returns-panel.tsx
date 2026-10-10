"use client"

/**
 * Supplier returns history. The .NET API only lists returns per supplier
 * (`/suppliers/{id}/returns`), so the user picks a supplier first. A supplier
 * return is final the moment it is created (stock and the AP ledger update
 * synchronously), so there are no approve/reject actions here — only history.
 */

import { Fragment, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronLeft, ChevronRight, PackageX, Truck } from "lucide-react"
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
import type { DotnetSupplierReturnItemDto } from "@/lib/api/suppliers-api"
import { useCurrency } from "@/lib/contexts/currency-context"
import { formatDate } from "@/lib/utils/formatting"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20
/** Shared with the create flows so the list opens on the supplier just returned to. */
export const LAST_SUPPLIER_KEY = "pharmacare:supplier-returns:last-supplier"

export const supplierReturnsKeys = {
  all: ["supplier-returns"] as const,
  list: (supplierId: string, page: number) => [...supplierReturnsKeys.all, supplierId, page] as const,
}

interface SupplierReturnsPanelProps {
  onNewReturn: () => void
}

export function SupplierReturnsPanel({ onNewReturn }: SupplierReturnsPanelProps) {
  const { formatCurrency } = useCurrency()
  const [supplierId, setSupplierId] = useState("")
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Inactive suppliers too: past returns to a since-deactivated supplier must stay reachable.
  const suppliersQuery = useSupplierOptions({ includeInactive: true })
  const suppliers = suppliersQuery.options

  // Remember the supplier the user last looked at — returns are usually checked supplier by supplier.
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_SUPPLIER_KEY)
      if (last) setSupplierId(last)
    } catch {
      // storage unavailable
    }
  }, [])

  const selectSupplier = (id: string) => {
    setSupplierId(id)
    setPage(1)
    setExpanded(null)
    try {
      localStorage.setItem(LAST_SUPPLIER_KEY, id)
    } catch {
      // storage unavailable
    }
  }

  const returnsQuery = useQuery({
    queryKey: supplierReturnsKeys.list(supplierId, page),
    queryFn: () => supplierReturnsApi.list(supplierId, { page, limit: PAGE_SIZE }),
    enabled: Boolean(supplierId),
  })

  const rows = returnsQuery.data?.data ?? []
  const total = returnsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const loadError = returnsQuery.data?.error ?? (returnsQuery.error instanceof Error ? returnsQuery.error.message : null)
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-1.5 sm:max-w-sm">
          <Label htmlFor="supplier-returns-supplier">Supplier</Label>
          <Select value={supplierId} onValueChange={selectSupplier} disabled={suppliersQuery.isLoading}>
            <SelectTrigger id="supplier-returns-supplier" className="w-full">
              <SelectValue
                placeholder={
                  suppliersQuery.isLoading
                    ? "Loading suppliers…"
                    : suppliersQuery.error
                      ? "Couldn't load suppliers"
                      : suppliers.length === 0
                        ? "No suppliers yet"
                        : "Choose a supplier"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suppliersQuery.error && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
              {suppliersQuery.error}
              <Button type="button" size="sm" variant="outline" onClick={suppliersQuery.refetch}>
                Retry
              </Button>
            </p>
          )}
        </div>
        {supplierId && total > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="num font-medium text-foreground">{total}</span> {total === 1 ? "return" : "returns"} to{" "}
            {supplierName ?? "this supplier"}
          </p>
        )}
      </div>

      {!supplierId ? (
        <EmptyState
          size="compact"
          icon={Truck}
          title="Choose a supplier to see their returns"
          description="Supplier returns are kept per supplier. Each one has already reduced your stock and credited the supplier's payable balance."
          action={{ label: "New supplier return", onClick: onNewReturn, icon: Truck }}
        />
      ) : returnsQuery.isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : loadError ? (
        <ErrorState
          size="compact"
          title="We couldn't load these returns"
          message={loadError}
          onRetry={() => returnsQuery.refetch()}
          retrying={returnsQuery.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={PackageX}
          title={`No returns to ${supplierName ?? "this supplier"} yet`}
          description="When you send damaged, expired or wrong goods back, record it here so stock and payables stay accurate."
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
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Reasons</TableHead>
                  <TableHead className="text-right">Credit value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isOpen = expanded === r.id
                  const units = r.items.reduce((sum, i) => sum + i.quantity, 0)
                  const reasons = Array.from(new Set(r.items.map((i) => i.returnReason).filter(Boolean)))
                  return (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:h-8 sm:w-8"
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            aria-expanded={isOpen}
                            aria-controls={`sr-lines-${r.id}`}
                            aria-label={isOpen ? "Hide returned items" : "Show returned items"}
                          >
                            <ChevronDown className={cn("transition-transform duration-200", isOpen && "rotate-180")} aria-hidden />
                          </Button>
                        </TableCell>
                        <TableCell className="num">{formatDate(r.returnDateUtc)}</TableCell>
                        <TableCell className="num text-right">
                          {r.items.length} <span className="text-muted-foreground">({units} units)</span>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="flex flex-wrap gap-1">
                            {reasons.slice(0, 3).map((reason) => (
                              <Badge key={reason} variant="muted" className="capitalize">
                                {reason.replace(/_/g, " ")}
                              </Badge>
                            ))}
                            {reasons.length > 3 && <Badge variant="muted">+{reasons.length - 3}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="num text-right font-semibold">{formatCurrency(r.totalCost)}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow id={`sr-lines-${r.id}`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={5} className="whitespace-normal p-0">
                            <ReturnLines items={r.items} notes={r.notes} formatCurrency={formatCurrency} />
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
            <nav className="flex items-center justify-between gap-2" aria-label="Supplier returns pages">
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
  items,
  notes,
  formatCurrency,
}: {
  items: DotnetSupplierReturnItemDto[]
  notes: string | null
  formatCurrency: (amount: number) => string
}) {
  return (
    <div className="space-y-3 px-4 py-3 sm:pl-14">
      <ul className="divide-y rounded-md border bg-card">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <MedicineName id={item.medicineId} />
              <p className="text-xs capitalize text-muted-foreground">
                {item.returnReason.replace(/_/g, " ")}
                {item.notes ? ` — ${item.notes}` : ""}
              </p>
            </div>
            <p className="num text-muted-foreground sm:w-40 sm:text-right">
              {item.quantity} × {formatCurrency(item.unitCost)}
            </p>
            <p className="num font-medium sm:w-28 sm:text-right">{formatCurrency(item.totalCost)}</p>
          </li>
        ))}
      </ul>
      {notes && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span> {notes}
        </p>
      )}
    </div>
  )
}

/** Return lines carry only a medicine id; resolve the name through the cached medicine query. */
function MedicineName({ id }: { id: string }) {
  const { data, isLoading } = useMedicine(id)
  if (isLoading) return <span className="inline-block h-4 w-40 animate-pulse rounded bg-muted" aria-label="Loading medicine name" />
  return <p className="truncate font-medium text-foreground">{data?.data?.name ?? "Unknown medicine"}</p>
}
