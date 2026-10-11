"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/ui/pagination"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { FetchingIndicator, MoneyCell, QueryState, ScrollTable, stickyHeaderClass } from "@/features/accounting/components/accounting-ui"
import { useBranches } from "@/features/branches/hooks/use-branches"
import { useSupplierLedgerPage } from "@/features/suppliers/hooks/use-supplier-bills"
import type { LegacySupplierLedgerEntry } from "@/lib/api/suppliers-api"

const TYPE: Record<string, { label: string; variant: "info" | "success" | "warning" | "muted" }> = {
  purchase: { label: "Purchase", variant: "info" },
  payment: { label: "Payment", variant: "success" },
  return: { label: "Return", variant: "warning" },
  opening_balance: { label: "Opening", variant: "muted" },
  adjustment: { label: "Adjustment", variant: "muted" },
}

/** "Applied to GRN-…" for a bill payment, otherwise the document number. */
function documentCell(entry: LegacySupplierLedgerEntry): { text: string | null; hint: string | null } {
  if (entry.entry_type === "payment") {
    return entry.reference_number
      ? { text: entry.reference_number, hint: "Paid against this bill" }
      : { text: null, hint: "Settles the oldest open bills" }
  }
  return { text: entry.reference_number, hint: null }
}

/** One supplier's ledger, newest first, paged on the server. */
export function SupplierLedgerTable({
  supplierId,
  branchId,
  pageSize = 20,
  compact = false,
}: {
  supplierId: string
  branchId?: string | null
  pageSize?: number
  compact?: boolean
}) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [supplierId, branchId])
  const ledger = useSupplierLedgerPage(supplierId, page, pageSize, { branchId })
  const branches = useBranches()
  const branchName = useMemo(() => {
    const map = new Map((branches.data ?? []).map((b) => [b.id, b.code || b.name]))
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—")
  }, [branches.data])
  const entries = ledger.data?.entries ?? []
  const showBranch = !compact && (branches.data?.length ?? 0) > 1

  return (
    <div className="space-y-3">
      <QueryState
        isLoading={ledger.isLoading}
        error={ledger.error}
        onRetry={() => void ledger.refetch()}
        retrying={ledger.isFetching}
        errorTitle="Couldn't load the supplier ledger"
        skeleton={<SkeletonTable rows={5} cols={6} />}
        isEmpty={entries.length === 0}
        empty={{
          icon: FileText,
          title: "No ledger entries",
          description: "Bills, payments and returns appear here once they are recorded.",
        }}
      >
        <div className="flex justify-end">
          <FetchingIndicator active={ledger.isFetching && !ledger.isLoading} />
        </div>
        <ScrollTable maxHeight={compact ? "max-h-[40vh]" : "max-h-[55vh]"} label="Supplier ledger">
          <TableHeader className={stickyHeaderClass}>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Document no.</TableHead>
              {!compact && <TableHead>Supplier bill</TableHead>}
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              {showBranch && <TableHead>Branch</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const date = e.entry_date.slice(0, 10)
              const type = TYPE[e.entry_type] ?? { label: e.entry_type.replace(/_/g, " "), variant: "muted" as const }
              const doc = documentCell(e)
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="num block">{date}</span>
                    <span className="num text-xs text-muted-foreground">BS {formatBsYmd(date)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={type.variant}>{type.label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px]" title={e.description ?? undefined}>
                    {doc.text ? <span className="block truncate font-mono text-xs">{doc.text}</span> : <span className="text-muted-foreground">—</span>}
                    {doc.hint && <span className="block text-xs text-muted-foreground">{doc.hint}</span>}
                  </TableCell>
                  {!compact && (
                    <TableCell className="max-w-[140px] truncate text-sm" title={e.supplier_bill_number ?? undefined}>
                      {e.supplier_bill_number ?? "—"}
                    </TableCell>
                  )}
                  <MoneyCell value={e.debit} blankZero />
                  <MoneyCell value={e.credit} blankZero />
                  <MoneyCell value={e.balance_after} strong signed />
                  {showBranch && <TableCell className="text-sm">{branchName(e.branch_id)}</TableCell>}
                </TableRow>
              )
            })}
          </TableBody>
        </ScrollTable>
        {ledger.data && (
          <Pagination
            currentPage={ledger.data.page}
            totalPages={ledger.data.totalPages}
            totalItems={ledger.data.totalCount}
            itemsPerPage={ledger.data.pageSize}
            startIndex={(ledger.data.page - 1) * ledger.data.pageSize}
            onPageChange={setPage}
          />
        )}
      </QueryState>
    </div>
  )
}
