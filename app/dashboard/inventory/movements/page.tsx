"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react"
import { inventoryTransactionsApi, type InventoryTransaction } from "@/features/inventory/api-client-transactions"
import { apiGet, apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useToast } from "@/hooks/use-toast"

interface Branch {
  id: string
  name: string
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  purchase: { label: "Purchase", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  sale: { label: "Sale", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  adjustment: { label: "Adjustment", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  return: { label: "Return", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  expired: { label: "Expired write-off", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
}

const LIMIT = 50

export default function InventoryMovementsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<InventoryTransaction[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [transactionType, setTransactionType] = useState<string>("all")
  const [branchId, setBranchId] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    apiGet<{ branches: Branch[] }>("/api/branch-context")
      .then((data) => setBranches(data?.branches || []))
      .catch(() => setBranches([]))
  }, [])

  const load = async () => {
    setIsLoading(true)
    try {
      const res = await inventoryTransactionsApi.list({
        transactionType: transactionType === "all" ? undefined : transactionType,
        branchId: branchId === "all" ? undefined : branchId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit: LIMIT,
      })
      setRows(res.data)
      setTotalPages(res.totalPages)
      setTotalCount(res.count)
    } catch (error) {
      toast({ title: "Failed to load movement history", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionType, branchId, dateFrom, dateTo, page])

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionType, branchId, dateFrom, dateTo])

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
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={transactionType} onValueChange={setTransactionType}>
                    <SelectTrigger>
                      <SelectValue />
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Branch</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue />
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading movements…</p>
              ) : rows.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No movements match these filters.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>By</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const style = TYPE_STYLES[r.transaction_type] || { label: r.transaction_type, className: "" }
                        const isIn = r.quantity > 0
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {new Date(r.transaction_date).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={style.className}>
                                {style.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{r.medicines?.name || "—"}</TableCell>
                            <TableCell>{r.branches?.name || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className={`inline-flex items-center gap-1 ${isIn ? "text-emerald-600" : "text-red-600"}`}>
                                {isIn ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                                {isIn ? "+" : ""}
                                {r.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.reference_type ? `${r.reference_type}` : "—"}
                            </TableCell>
                            <TableCell className="text-sm">{r.users?.full_name || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {r.reason_code ? `${r.reason_code}${r.notes ? ` — ${r.notes}` : ""}` : r.notes || "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={LIMIT}
                  startIndex={(page - 1) * LIMIT}
                  onPageChange={setPage}
                />
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
