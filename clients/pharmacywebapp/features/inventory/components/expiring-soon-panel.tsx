"use client"

import { useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CalendarClock, FileWarning, PackageCheck } from "lucide-react"
import { Section } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Pagination } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { expiringBatchesApi } from "@/features/inventory/api-client-expired-batches"
import { EXPIRY_WINDOWS, expiryHref, parseExpiryWindow, type ExpiryWindow } from "@/features/inventory/lib/expiry-area"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { useAllowed } from "@/lib/hooks/use-has-permission"

const PAGE_SIZE = 20

/** Stock > Expiry > Expiring soon: in-date lots that expire within the window, soonest first. */
export function ExpiringSoonPanel() {
  const [withinDays, setWithinDays] = useState<ExpiryWindow>(30)
  const [page, setPage] = useState(1)
  const branchFilter = useBranchFilter()
  const branchId = branchFilter.branchId
  const { allowed: canSeeClaims } = useAllowed("expiry_claims:read")

  const lots = useQuery({
    queryKey: ["inventory", "expiring-batches", withinDays, branchId ?? ""],
    queryFn: () => expiringBatchesApi.list(withinDays, branchId),
    placeholderData: keepPreviousData,
  })

  const rows = lots.data ?? []
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  return (
    <>
      <div className="flex flex-wrap items-end justify-end gap-2">
        <BranchFilterSelect filter={branchFilter} id="expiring-branch" hideLabel onChange={() => setPage(1)} />
        {canSeeClaims && (
          <Button asChild variant="outline">
            <Link href={expiryHref("claims")}>
              <FileWarning aria-hidden />
              Claim from supplier
            </Link>
          </Button>
        )}
      </div>
      <Section spacing="lg">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Lots expiring soon</CardTitle>
              <CardDescription>
                Still sellable. Sell these first (FEFO), or ask the supplier to take them back before they expire.
              </CardDescription>
            </div>
            <Select
              value={String(withinDays)}
              onValueChange={(v) => {
                setWithinDays(parseExpiryWindow(v))
                setPage(1)
              }}
            >
              <SelectTrigger className="sm:w-52" aria-label="Expiry window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_WINDOWS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Expiring in {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {lots.isLoading ? (
              <SkeletonTable rows={4} cols={6} />
            ) : lots.isError ? (
              <ErrorState
                size="compact"
                title="Couldn't load expiring stock"
                message={stockErrorMessage(lots.error, "Check your connection and try again.")}
                onRetry={() => void lots.refetch()}
                retrying={lots.isFetching}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                size="compact"
                icon={PackageCheck}
                title="Nothing expires in this window"
                description={`No lot in stock expires in the next ${withinDays} days. Try a longer window.`}
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch no.</TableHead>
                        {branchFilter.showBranchColumn && <TableHead>Branch</TableHead>}
                        <TableHead>Expires on</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((lot) => (
                        <TableRow key={lot.batchId}>
                          <TableCell className="max-w-[220px] truncate font-medium" title={lot.medicineName}>
                            {lot.medicineName}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{lot.batchNo}</TableCell>
                          {branchFilter.showBranchColumn && (
                            <TableCell className="whitespace-nowrap">{branchFilter.branchName(lot.branchId)}</TableCell>
                          )}
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="num">{lot.expiryDate}</span>
                              <Badge variant={lot.daysUntilExpiry <= 30 ? "warning" : "secondary"}>
                                <CalendarClock aria-hidden />
                                {lot.daysUntilExpiry === 0 ? "Expires today" : `${lot.daysUntilExpiry} days left`}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="num text-right">{lot.quantityOnHand}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <Pagination
                    currentPage={current}
                    totalPages={totalPages}
                    totalItems={rows.length}
                    itemsPerPage={PAGE_SIZE}
                    startIndex={(current - 1) * PAGE_SIZE}
                    onPageChange={setPage}
                    className="mt-4"
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Section>
    </>
  )
}
