"use client"

import { useEffect, useRef, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, type Column } from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/date-range-picker"
import { Activity, ArrowDownCircle, ArrowUpCircle, History, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StockAdjustmentDialog } from "@/features/inventory/components/stock-adjustment-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { inventoryTransactionsApi, type InventoryTransaction } from "@/features/inventory/api-client-transactions"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { effectiveBranchFilter } from "@/features/branches/lib/branch-access"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import { useToast } from "@/hooks/use-toast"
import { nepalDayEndInclusiveUtc, nepalDayStartUtc } from "@/lib/utils/nepal-time"
import { formatLocalDateYmd } from "@/lib/utils/date"

interface DateRange {
  from: Date
  to: Date
}

type BadgeTone = "success" | "info" | "warning" | "muted" | "danger"

const TYPE_STYLES: Record<string, { label: string; variant: BadgeTone }> = {
  purchase: { label: "Purchase", variant: "success" },
  sale: { label: "Sale", variant: "info" },
  adjustment: { label: "Adjustment", variant: "warning" },
  return: { label: "Return", variant: "muted" },
  expired: { label: "Expired write-off", variant: "danger" },
  transfer: { label: "Transfer", variant: "info" },
  supplier_return: { label: "Supplier return", variant: "muted" },
  recall: { label: "Recall", variant: "danger" },
}

// Hard cap on how many rows "Export all" will pull across pages — protects
// against an unbounded filter (e.g. no date range on a years-old tenant)
// turning one click into thousands of sequential requests.
const EXPORT_MAX_ROWS = 20000
const EXPORT_PAGE_SIZE = 200

export default function InventoryMovementsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<InventoryTransaction[]>([])
  const branchAccess = useBranchAccess()
  const branches = branchAccess.branches
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [totalPages, setTotalPages] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [transactionType, setTransactionTypeState] = useState<string>("all")
  const [branchId, setBranchIdState] = useState<string>("all")
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined)
  const [adjustOpen, setAdjustOpen] = useState(false)
  // Only the newest request may write rows: a slow response for an old filter must not overwrite a newer one.
  const requestSeq = useRef(0)

  // Changing a filter resets to page 1 in the same render, so there is one fetch with the right page
  // (a separate "reset page" effect fired a second fetch for the stale page first).
  const setTransactionType = (value: string) => {
    setTransactionTypeState(value)
    setPage(1)
  }
  const setBranchId = (value: string) => {
    setBranchIdState(value)
    setPage(1)
  }
  const setDateRange = (value: DateRange | undefined) => {
    setDateRangeState(value)
    setPage(1)
  }
  const branchName = (id: string | undefined) => (id ? branches.find((b) => b.id === id)?.name : undefined)

  // "all" = no filter; users limited to their own branch are always pinned to it.
  const effectiveBranchId = effectiveBranchFilter(branchAccess, branchId === "all" ? "" : branchId)

  const currentFilters = () => ({
    transactionType: transactionType === "all" ? undefined : transactionType,
    branchId: effectiveBranchId || undefined,
    // Picked days are whole Nepal days, whatever the device's time zone.
    dateFrom: dateRange?.from ? nepalDayStartUtc(formatLocalDateYmd(dateRange.from)) : undefined,
    dateTo: dateRange?.to ? nepalDayEndInclusiveUtc(formatLocalDateYmd(dateRange.to)) : undefined,
  })

  const load = async () => {
    const seq = ++requestSeq.current
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await inventoryTransactionsApi.list({ ...currentFilters(), page, limit: itemsPerPage })
      if (seq !== requestSeq.current) return
      setRows(res.data)
      setTotalPages(res.totalPages)
      setTotalCount(res.count)
    } catch (error) {
      if (seq !== requestSeq.current) return
      setLoadError(
        `Couldn't load movement history: ${error instanceof Error ? error.message : "something went wrong"}. Change a filter or reload the page to try again.`
      )
      toast({
        title: "Failed to load movement history",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      })
    } finally {
      if (seq === requestSeq.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionType, effectiveBranchId, dateRange, page, itemsPerPage])

  const exportAll = async (): Promise<InventoryTransaction[]> => {
    const filters = currentFilters()
    const all: InventoryTransaction[] = []
    let exportPage = 1
    while (all.length < EXPORT_MAX_ROWS) {
      const res = await inventoryTransactionsApi.list({ ...filters, page: exportPage, limit: EXPORT_PAGE_SIZE })
      all.push(...res.data)
      if (exportPage >= res.totalPages || res.data.length === 0) break
      exportPage++
    }
    return all
  }

  const columns: Column<InventoryTransaction>[] = [
    {
      key: "date",
      header: "Date",
      cell: (r) => <span className="num whitespace-nowrap text-sm">{new Date(r.transaction_date).toLocaleString()}</span>,
      exportValue: (r) => new Date(r.transaction_date).toLocaleString(),
    },
    {
      key: "type",
      header: "Type",
      cell: (r) => {
        const style = TYPE_STYLES[r.transaction_type] || { label: r.transaction_type, variant: "muted" as const }
        return (
          <Badge variant={style.variant}>
            {style.label}
          </Badge>
        )
      },
      exportValue: (r) => TYPE_STYLES[r.transaction_type]?.label || r.transaction_type,
    },
    {
      key: "medicine",
      header: "Medicine",
      cell: (r) => (
        <span className="block max-w-[220px] truncate font-medium" title={r.medicines?.name || undefined}>
          {r.medicines?.name || "—"}
        </span>
      ),
      exportValue: (r) => r.medicines?.name || "",
    },
    {
      key: "branch",
      header: "Branch",
      // The .NET row carries only the branch id; the name comes from the branch list.
      cell: (r) => r.branches?.name || branchName(r.branches?.id) || "—",
      exportValue: (r) => r.branches?.name || branchName(r.branches?.id) || "",
    },
    {
      key: "qty",
      header: "Qty",
      className: "text-right",
      cell: (r) => {
        const isIn = r.quantity > 0
        return (
          <span className={`num inline-flex w-full items-center justify-end gap-1 font-medium ${isIn ? "text-success" : "text-destructive"}`}>
            {isIn ? <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownCircle className="h-3.5 w-3.5" aria-hidden />}
            <span className="sr-only">{isIn ? "Stock in" : "Stock out"}</span>
            {isIn ? "+" : ""}
            {r.quantity}
          </span>
        )
      },
      exportValue: (r) => r.quantity,
    },
    {
      key: "reference",
      header: "Reference",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.reference_type || "—"}</span>,
      exportValue: (r) => r.reference_type || "",
    },
    {
      key: "by",
      header: "By",
      cell: (r) => <span className="text-sm">{r.users?.full_name || "—"}</span>,
      exportValue: (r) => r.users?.full_name || "",
    },
    {
      key: "notes",
      header: "Notes",
      cell: (r) => {
        const text = r.reason_code ? `${r.reason_code}${r.notes ? ` — ${r.notes}` : ""}` : r.notes || ""
        return (
          <span className="block max-w-[200px] truncate text-xs text-muted-foreground" title={text || undefined}>
            {text || "—"}
          </span>
        )
      },
      exportValue: (r) => (r.reason_code ? `${r.reason_code}${r.notes ? ` — ${r.notes}` : ""}` : r.notes || ""),
    },
  ]

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Movement history"
          icon={Activity}
          description="Audit trail of every stock change: purchases received, sales, adjustments, returns and expiry write-offs."
          actions={
            <Button onClick={() => setAdjustOpen(true)}>
              <SlidersHorizontal aria-hidden />
              Record adjustment
            </Button>
          }
        />

        <StockAdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen} onAdjusted={() => (page === 1 ? load() : setPage(1))} />

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" aria-hidden />
                Movement log
              </CardTitle>
              <CardDescription>
                <span className="num">{totalCount.toLocaleString()}</span> movement{totalCount === 1 ? "" : "s"} match these filters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={rows}
                columns={columns}
                isLoading={isLoading}
                error={loadError}
                emptyMessage="No movements match these filters."
                emptyState={
                  <EmptyState
                    size="compact"
                    icon={History}
                    title="No stock movements found"
                    description="Nothing changed stock for these filters. Widen the date range or choose a different type or branch."
                    action={
                      transactionType !== "all" || branchId !== "all" || dateRange
                        ? {
                            label: "Clear filters",
                            onClick: () => {
                              setTransactionType("all")
                              setBranchId("all")
                              setDateRange(undefined)
                            },
                          }
                        : undefined
                    }
                  />
                }
                showSearch={false}
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setPage}
                onItemsPerPageChange={(n) => {
                  setItemsPerPage(n)
                  setPage(1)
                }}
                itemsPerPageOptions={[25, 50, 100, 200]}
                enableExport
                exportFilename="inventory-movements"
                exportTitle="Inventory movements"
                onExportAll={exportAll}
                filters={
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={transactionType} onValueChange={setTransactionType}>
                      <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by movement type">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="purchase">Purchase</SelectItem>
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                        <SelectItem value="expired">Expired write-off</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                        <SelectItem value="supplier_return">Supplier return</SelectItem>
                        <SelectItem value="recall">Recall</SelectItem>
                      </SelectContent>
                    </Select>
                    {!branchAccess.isLoading && !branchAccess.canViewAll && branches.length > 0 && (
                      <BranchScopeBadge branch={branchAccess.ownBranch} className="w-[160px]" />
                    )}
                    {!branchAccess.isLoading && branchAccess.canViewAll && branches.length > 0 && (
                      <Select value={branchId} onValueChange={setBranchId}>
                        <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by branch">
                          <SelectValue placeholder="Branch" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All branches</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                  </div>
                }
              />
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
