"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, type Column } from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/date-range-picker"
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react"
import { inventoryTransactionsApi, type InventoryTransaction } from "@/features/inventory/api-client-transactions"
import { apiGet } from "@/lib/api/client-helpers"
import { useToast } from "@/hooks/use-toast"

interface Branch {
  id: string
  name: string
}

interface DateRange {
  from: Date
  to: Date
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  purchase: { label: "Purchase", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  sale: { label: "Sale", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  adjustment: { label: "Adjustment", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  return: { label: "Return", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  expired: { label: "Expired write-off", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
}

// Hard cap on how many rows "Export all" will pull across pages — protects
// against an unbounded filter (e.g. no date range on a years-old tenant)
// turning one click into thousands of sequential requests.
const EXPORT_MAX_ROWS = 20000
const EXPORT_PAGE_SIZE = 200

export default function InventoryMovementsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<InventoryTransaction[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [totalPages, setTotalPages] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [transactionType, setTransactionType] = useState<string>("all")
  const [branchId, setBranchId] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  useEffect(() => {
    apiGet<{ branches: Branch[] }>("/api/branch-context")
      .then((data) => setBranches(data?.branches || []))
      .catch(() => setBranches([]))
  }, [])

  const currentFilters = () => ({
    transactionType: transactionType === "all" ? undefined : transactionType,
    branchId: branchId === "all" ? undefined : branchId,
    dateFrom: dateRange?.from ? dateRange.from.toISOString() : undefined,
    dateTo: dateRange?.to ? dateRange.to.toISOString() : undefined,
  })

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await inventoryTransactionsApi.list({ ...currentFilters(), page, limit: itemsPerPage })
      setRows(res.data)
      setTotalPages(res.totalPages)
      setTotalCount(res.count)
    } catch (error) {
      toast({
        title: "Failed to load movement history",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionType, branchId, dateRange, page, itemsPerPage])

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionType, branchId, dateRange])

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
      cell: (r) => <span className="whitespace-nowrap text-sm">{new Date(r.transaction_date).toLocaleString()}</span>,
      exportValue: (r) => new Date(r.transaction_date).toLocaleString(),
    },
    {
      key: "type",
      header: "Type",
      cell: (r) => {
        const style = TYPE_STYLES[r.transaction_type] || { label: r.transaction_type, className: "" }
        return (
          <Badge variant="secondary" className={style.className}>
            {style.label}
          </Badge>
        )
      },
      exportValue: (r) => TYPE_STYLES[r.transaction_type]?.label || r.transaction_type,
    },
    {
      key: "medicine",
      header: "Medicine",
      cell: (r) => <span className="font-medium">{r.medicines?.name || "—"}</span>,
      exportValue: (r) => r.medicines?.name || "",
    },
    {
      key: "branch",
      header: "Branch",
      cell: (r) => r.branches?.name || "—",
      exportValue: (r) => r.branches?.name || "",
    },
    {
      key: "qty",
      header: "Qty",
      className: "text-right",
      cell: (r) => {
        const isIn = r.quantity > 0
        return (
          <span className={`inline-flex items-center gap-1 justify-end w-full ${isIn ? "text-emerald-600" : "text-red-600"}`}>
            {isIn ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
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
      cell: (r) => (
        <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
          {r.reason_code ? `${r.reason_code}${r.notes ? ` — ${r.notes}` : ""}` : r.notes || "—"}
        </span>
      ),
      exportValue: (r) => (r.reason_code ? `${r.reason_code}${r.notes ? ` — ${r.notes}` : ""}` : r.notes || ""),
    },
  ]

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Inventory Movements"
          description="Full audit trail of every stock change — purchases received, sales, adjustments, returns, and expiry write-offs"
        />

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Movement Log
              </CardTitle>
              <CardDescription>{totalCount} movement{totalCount === 1 ? "" : "s"} recorded</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={rows}
                columns={columns}
                isLoading={isLoading}
                emptyMessage="No movements match these filters."
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
                exportTitle="Inventory Movements"
                onExportAll={exportAll}
                filters={
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={transactionType} onValueChange={setTransactionType}>
                      <SelectTrigger className="h-9 w-[160px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="purchase">Purchase</SelectItem>
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                        <SelectItem value="expired">Expired write-off</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={branchId} onValueChange={setBranchId}>
                      <SelectTrigger className="h-9 w-[160px]">
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
