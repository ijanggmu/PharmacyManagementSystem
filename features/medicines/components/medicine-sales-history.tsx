"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import { salesApi, type Sale } from "@/features/sales/api-client"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { formatSaleDate } from "@/features/sales/lib/sale-detail"

const PAGE_SIZE = 10

/** Quantity and amount of this medicine on one sale (a sale can carry several lines of it). */
export function medicineLineTotals(sale: Sale, medicineId: string): { quantity: number; amount: number } {
  const lines = (sale.sale_items ?? []).filter((item) => item.medicine_id === medicineId)
  return {
    quantity: lines.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    amount: lines.reduce((sum, item) => sum + Number(item.total_price || 0), 0),
  }
}

/**
 * Recent sales of one medicine (GET /sales?medicineId=…, newest first) with the branch each sale was made
 * at. "View all" opens the full sales list filtered to the medicine.
 */
export function MedicineSalesHistory({ medicineId }: { medicineId: string }) {
  const [page, setPage] = useState(1)
  const branchFilter = useBranchFilter()

  const query = useQuery({
    queryKey: ["sales", "by-medicine", medicineId, branchFilter.branchId ?? "", page],
    queryFn: async () => {
      const res = await salesApi.getSales({
        medicineId,
        branchId: branchFilter.branchId,
        page,
        limit: PAGE_SIZE,
        sortBy: "sale_date",
        sortOrder: "desc",
      })
      if (res.error) throw new Error(res.error)
      return { rows: res.data ?? [], total: res.total ?? (res.data ?? []).length }
    },
  })

  const rows = query.data?.rows ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <BranchFilterSelect
          filter={branchFilter}
          id="medicine-sales-branch"
          onChange={() => setPage(1)}
        />
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/sales?medicineId=${encodeURIComponent(medicineId)}`}>
            <ExternalLink aria-hidden />
            View all in Sales
          </Link>
        </Button>
      </div>

      {query.isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : query.error ? (
        <ErrorState
          size="compact"
          title="Couldn't load sales history"
          message={query.error instanceof Error ? query.error.message : "Something went wrong."}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState size="compact" icon={Receipt} title="No sales yet" description="Sales of this medicine will appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  {branchFilter.showBranchColumn && <TableHead>Branch</TableHead>}
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sale) => {
                  const { quantity, amount } = medicineLineTotals(sale, medicineId)
                  const { ad, bs } = formatSaleDate(sale.sale_date)
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="num">{ad}</div>
                        {bs && <div className="num text-xs text-muted-foreground">{bs}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {sale.invoice_number || sale.sale_number}
                        {sale.status === "cancelled" && (
                          <Badge variant="outline" className="ml-2">
                            Cancelled
                          </Badge>
                        )}
                      </TableCell>
                      {branchFilter.showBranchColumn && (
                        <TableCell className="whitespace-nowrap">{branchFilter.branchName(sale.branch_id)}</TableCell>
                      )}
                      <TableCell className="num text-right">{quantity}</TableCell>
                      <TableCell className="num text-right">
                        <CurrencyDisplay amount={amount.toString()} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={PAGE_SIZE}
            startIndex={(page - 1) * PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
