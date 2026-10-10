"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { CircleCheck, Package, PackageX, Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { CurrencyDisplay } from "@/components/currency-display"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { getDeadStockReportPage, getDeadStockReport } from "@/lib/api/reports-api"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { Pagination } from "@/components/ui/pagination"

// The .NET dead-stock endpoint (/api/v1/inventory/reports/dead-stock) now pages for real
// (`PagedResponse<DeadStockRowDto>`), so each page turn requests only that page from the server.
const PAGE_SIZE = 20

interface DeadStockRow {
  medicine_id: string
  medicine_name: string
  supplier_name: string | null
  stock_quantity: number
  inventory_value: number
  last_sold_date: string | null
  expiry_date: string | null
  branch_id: string | null
}

export default function DeadStockReportPage() {
  const [rows, setRows] = useState<DeadStockRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [sinceDays, setSinceDays] = useState("90")
  // Dead stock is judged per branch: stock that sells at one branch can still sit idle at another.
  const branchFilter = useBranchFilter()
  const branchId = branchFilter.branchId
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalValue, setTotalValue] = useState(0)
  const { toast } = useToast()

  // The current page of the table — real server-side paging, one request per page turn.
  useEffect(() => {
    // A superseded request (window or page changed before it returned) must not overwrite newer rows.
    let active = true
    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const data = await getDeadStockReportPage(Number(sinceDays), currentPage, PAGE_SIZE, branchId)
        if (!active) return
        setRows(data.rows)
        setTotalItems(data.totalCount)
        setTotalPages(Math.max(1, data.totalPages))
      } catch (error) {
        if (!active) return
        const message = apiRequestErrorMessage(error)
        setLoadError(message)
        toast({ title: "Failed to load dead stock report", description: message, variant: "destructive" })
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays, currentPage, reloadToken, branchId])

  // Window changed: restart the table at page 1 in the same render, so only one fetch goes out.
  const changeWindow = (value: string) => {
    setSinceDays(value)
    setCurrentPage(1)
  }

  // "Value tied up" is a sum across the whole window, not just the visible page, so it comes from a
  // separate full-window fetch (walks every page internally) rather than the paged table fetch above.
  useEffect(() => {
    let active = true
    const loadTotalValue = async () => {
      try {
        const all = await getDeadStockReport(Number(sinceDays), branchId)
        if (active) setTotalValue(all.reduce((sum, r) => sum + r.inventory_value, 0))
      } catch {
        // The table's own error state already covers this request failing; the stat just stays stale.
      }
    }
    void loadTotalValue()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays, reloadToken, branchId])

  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * PAGE_SIZE
  const paginatedRows = rows

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Dead stock"
          description="Medicines with no sale in the selected window — cash tied up on the shelf."
          icon={Package}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <BranchFilterSelect filter={branchFilter} id="dead-stock-branch" hideLabel onChange={() => setCurrentPage(1)} />
              <Label htmlFor="dead-stock-window" className="whitespace-nowrap text-sm text-muted-foreground">
                No sale in
              </Label>
              <Select value={sinceDays} onValueChange={changeWindow}>
                <SelectTrigger id="dead-stock-window" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Section spacing="lg">
          <StatGrid cols={2}>
            <StatCard
              label="Idle items"
              value={totalItems.toLocaleString()}
              icon={PackageX}
              tone={totalItems > 0 ? "warning" : "success"}
              hint={`No sale in the last ${sinceDays} days`}
              loading={isLoading}
            />
            <StatCard
              label="Value tied up"
              value={<CurrencyDisplay amount={totalValue} />}
              icon={Wallet}
              tone={totalValue > 0 ? "warning" : "default"}
              hint="Stock value of idle items"
              loading={isLoading}
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Slow-moving inventory</CardTitle>
              <CardDescription>Sorted by value tied up, highest first</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <SkeletonTable rows={6} cols={6} />
              ) : loadError ? (
                <ErrorState
                  size="compact"
                  title="Couldn't load dead stock"
                  message={`${loadError} Check your connection and try again.`}
                  onRetry={() => setReloadToken((t) => t + 1)}
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  size="compact"
                  icon={CircleCheck}
                  title="Nothing sitting idle"
                  description={`Everything in stock has sold in the last ${sinceDays} days. Try a shorter window to spot slow movers earlier.`}
                />
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Last sold</TableHead>
                        <TableHead>Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRows.map((r) => (
                        <TableRow key={r.medicine_id}>
                          <TableCell className="max-w-[240px] truncate font-medium" title={r.medicine_name}>
                            {r.medicine_name}
                          </TableCell>
                          <TableCell
                            className="max-w-[200px] truncate text-sm text-muted-foreground"
                            title={r.supplier_name ?? undefined}
                          >
                            {r.supplier_name || "—"}
                          </TableCell>
                          <TableCell className="num text-right">{r.stock_quantity}</TableCell>
                          <TableCell className="num text-right font-medium">
                            <CurrencyDisplay amount={r.inventory_value} />
                          </TableCell>
                          <TableCell className="num text-sm">
                            {r.last_sold_date ? (
                              new Date(r.last_sold_date).toLocaleDateString()
                            ) : (
                              <Badge variant="muted">Never sold</Badge>
                            )}
                          </TableCell>
                          <TableCell className="num text-sm">{r.expiry_date || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!isLoading && !loadError && rows.length > 0 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={PAGE_SIZE}
                  startIndex={startIndex}
                  onPageChange={setCurrentPage}
                  className="mt-4"
                />
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
