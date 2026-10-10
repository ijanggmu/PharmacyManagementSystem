/**
 * Consignment inventory (2026-09 ERP audit, priority item #8) — supplier-owned
 * stock on the shelf. Receiving here posts no GL/AP entry (ownership hasn't
 * transferred); settling a supplier reads how much has sold since it was last
 * settled and posts a correcting voucher + supplier ledger entry. See
 * lib/server/services/consignment-service.ts.
 */

"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"
import { AlertCircle, Boxes, CheckCircle2, HandCoins, History, PackagePlus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { consignmentApi, type ConsignmentPosition, type ConsignmentSettlement } from "@/features/inventory/api-client-consignment"
import { ReceiveConsignmentDialog } from "@/features/inventory/components/receive-consignment-dialog"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"

/** Positions page from the .NET API — matches the request sent in `fetchPositions`. */
const POSITIONS_PAGE_SIZE = 10

/**
 * Settlements page from the .NET API — now pages for real (`PagedResponse<ConsignmentSettlementDto>`),
 * so each page turn requests only that page, same as positions above.
 */
const SETTLEMENTS_PAGE_SIZE = 10

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type ConsignmentView = "outstanding" | "settlements"

function parseView(raw: string | null): ConsignmentView {
  return raw === "settlements" ? "settlements" : "outstanding"
}

/** Count chip on a tab — reads the total already loaded for that list. */
function TabCount({ count, label }: { count: number; label: string }) {
  return (
    <span
      className="num ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium text-muted-foreground group-data-[state=active]/tab:bg-primary/10 group-data-[state=active]/tab:text-primary"
      aria-label={`${count} ${label}`}
    >
      {count}
    </span>
  )
}

export default function ConsignmentInventoryPage() {
  // useSearchParams (the ?view= tab) needs a Suspense boundary for prerendering.
  return (
    <Suspense fallback={null}>
      <ConsignmentInventoryContent />
    </Suspense>
  )
}

function ConsignmentInventoryContent() {
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = parseView(searchParams.get("view"))

  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (parseView(next) === "outstanding") params.delete("view")
    else params.set("view", "settlements")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const [loading, setLoading] = useState(true)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [positions, setPositions] = useState<ConsignmentPosition[]>([])
  const [positionsPage, setPositionsPage] = useState(1)
  const [positionsTotalCount, setPositionsTotalCount] = useState(0)
  const [positionsTotalPages, setPositionsTotalPages] = useState(1)
  const [positionsLoading, setPositionsLoading] = useState(false)

  const [settlements, setSettlements] = useState<ConsignmentSettlement[]>([])
  const [settlementsPage, setSettlementsPage] = useState(1)
  const [settlementsTotalCount, setSettlementsTotalCount] = useState(0)
  const [settlementsTotalPages, setSettlementsTotalPages] = useState(1)
  const [settlementsLoading, setSettlementsLoading] = useState(false)

  const [receiveOpen, setReceiveOpen] = useState(false)

  const [settlingSupplierId, setSettlingSupplierId] = useState<string | null>(null)
  // ViewAll users can narrow to one branch; rows then name their branch when several are shown.
  const branchFilter = useBranchFilter()
  const consignmentBranchId = branchFilter.branchId

/** One page of consignment positions, requested fresh from the .NET API — never a full-table walk. */
  const fetchPositions = useCallback(async (page: number) => {
    setPositionsLoading(true)
    const res = await consignmentApi.getPositions({ pageNumber: page, pageSize: POSITIONS_PAGE_SIZE, branchId: consignmentBranchId })
    if (res.error) {
      toast({ title: "Failed to load consignment positions", description: res.error, variant: "destructive" })
    }
    setPositions(res.data)
    setPositionsTotalCount(res.totalCount)
    setPositionsTotalPages(Math.max(1, res.totalPages))
    setPositionsPage(res.pageNumber)
    setPositionsLoading(false)
  }, [toast, consignmentBranchId])

  /** One page of consignment settlements, requested fresh from the .NET API. */
  const fetchSettlements = useCallback(async (page: number) => {
    setSettlementsLoading(true)
    const res = await consignmentApi.getSettlements({ pageNumber: page, pageSize: SETTLEMENTS_PAGE_SIZE, branchId: consignmentBranchId })
    if (res.error) {
      toast({ title: "Failed to load consignment settlements", description: res.error, variant: "destructive" })
    }
    setSettlements(res.data)
    setSettlementsTotalCount(res.totalCount)
    setSettlementsTotalPages(Math.max(1, res.totalPages))
    setSettlementsPage(res.pageNumber)
    setSettlementsLoading(false)
  }, [toast, consignmentBranchId])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [medicinesRes, suppliersRes] = await Promise.all([
        medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" }),
        suppliersApi.getAllSuppliers(),
      ])
      if (!active) return
      setMedicines(medicinesRes.data || [])
      setSuppliers(suppliersRes.data || [])
      await Promise.all([fetchPositions(1), fetchSettlements(1)])
      if (!active) return
      setLoading(false)
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A different branch scope re-reads both lists from page 1 (the initial load above covers the first scope).
  const firstBranchScope = useRef(true)
  useEffect(() => {
    if (firstBranchScope.current) {
      firstBranchScope.current = false
      return
    }
    void Promise.all([fetchPositions(1), fetchSettlements(1)])
  }, [consignmentBranchId, fetchPositions, fetchSettlements])

  const handlePositionsPageChange = (page: number) => {
    void fetchPositions(page)
  }

  const handleSettle = async (supId: string) => {
    setSettlingSupplierId(supId)
    try {
      const { data, error } = await consignmentApi.settle(supId)
      if (error) throw new Error(error)
      if (!data?.settlementId) {
        toast({ title: "Nothing to settle", description: "No consignment stock has sold since the last settlement." })
      } else {
        toast({ title: "Settled", description: `${data.totalQuantity ?? 0} unit(s) — NPR ${fmt(data.totalValue)} posted to the supplier's payable.` })
      }
      // The settlement changes amounts owed on this page and adds a row to settlement history.
      // A new settlement sorts newest-first, so it lands on page 1.
      await Promise.all([fetchPositions(positionsPage), fetchSettlements(1)])
    } catch (error) {
      toast({ title: "Settlement failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setSettlingSupplierId(null)
    }
  }

  const supplierNameById = suppliers.reduce<Record<string, string>>((acc, s) => {
    acc[s.id] = s.name
    return acc
  }, {})

  const positionsStartIndex = (positionsPage - 1) * POSITIONS_PAGE_SIZE

  const handleSettlementsPageChange = (page: number) => {
    void fetchSettlements(page)
  }

  const settlementsCurrentPage = Math.min(settlementsPage, settlementsTotalPages)
  const settlementsStartIndex = (settlementsCurrentPage - 1) * SETTLEMENTS_PAGE_SIZE
  const paginatedSettlements = settlements

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Consignment stock"
          icon={HandCoins}
          description="Supplier-owned stock on your shelf. You owe the supplier only once it sells — settle periodically to post what has sold."
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <BranchFilterSelect filter={branchFilter} id="consignment-branch" hideLabel />
              <Button onClick={() => setReceiveOpen(true)} disabled={loading}>
                <PackagePlus aria-hidden />
                Receive stock
              </Button>
            </div>
          }
        />

        <ReceiveConsignmentDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          medicines={medicines}
          suppliers={suppliers}
          // New stock sorts newest-first, so it lands on page 1.
          onReceived={() => fetchPositions(1)}
        />

        {loading ? (
          <div className="space-y-6" aria-busy="true">
            <span className="sr-only">Loading consignment stock…</span>
            <Skeleton className="h-5 w-56" />
            <SkeletonTable rows={4} cols={6} />
          </div>
        ) : (
          <Section spacing="lg">
            <Tabs value={view} onValueChange={setView} className="gap-4">
              <TabsList aria-label="Consignment views" className="w-full sm:w-fit">
                <TabsTrigger value="outstanding" className="group/tab sm:px-3">
                  Outstanding
                  <TabCount count={positionsTotalCount} label="consignment positions" />
                </TabsTrigger>
                <TabsTrigger value="settlements" className="group/tab sm:px-3">
                  Settlements
                  <TabCount count={settlementsTotalCount} label="settlements" />
                </TabsTrigger>
              </TabsList>

              <TabsContent value="outstanding" className="min-w-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Outstanding position</CardTitle>
                    <CardDescription>
                      Value sold but not yet settled, per consignment batch. Settling posts everything owed to that
                      supplier to their payable account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {positionsLoading ? (
                      <SkeletonTable rows={4} cols={7} />
                    ) : positions.length === 0 ? (
                      <EmptyState
                        size="compact"
                        icon={Boxes}
                        title="No consignment stock on hand"
                        description="Receive supplier-owned stock to see what has sold and what you owe."
                        action={{ label: "Receive stock", onClick: () => setReceiveOpen(true), icon: PackagePlus }}
                      />
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Medicine</TableHead>
                                <TableHead>Batch no.</TableHead>
                                {branchFilter.showBranchColumn && <TableHead>Branch</TableHead>}
                                <TableHead className="text-right">Received</TableHead>
                                <TableHead className="text-right">Remaining</TableHead>
                                <TableHead className="text-right">Sold, unsettled</TableHead>
                                <TableHead className="text-right">Value due (NPR)</TableHead>
                                <TableHead className="w-32 text-right">
                                  <span className="sr-only">Actions</span>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {positions.map((p) => (
                                <TableRow key={p.batch_id}>
                                  <TableCell className="max-w-[160px] truncate">
                                    {supplierNameById[p.supplier_id] || "—"}
                                  </TableCell>
                                  <TableCell className="max-w-[220px] truncate font-medium" title={p.medicine_name}>
                                    {p.medicine_name}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{p.batch_number}</TableCell>
                                  {branchFilter.showBranchColumn && (
                                    <TableCell className="whitespace-nowrap">{branchFilter.branchName(p.branch_id)}</TableCell>
                                  )}
                                  <TableCell className="num text-right">{p.quantity_received}</TableCell>
                                  <TableCell className="num text-right">{p.quantity_remaining}</TableCell>
                                  <TableCell className="num text-right">{p.unsettled_sold_quantity}</TableCell>
                                  <TableCell className="num text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {fmt(p.unsettled_value)}
                                      {p.unsettled_value > 0 ? (
                                        <Badge variant="warning">
                                          <AlertCircle aria-hidden />
                                          Due
                                        </Badge>
                                      ) : (
                                        <Badge variant="success">
                                          <CheckCircle2 aria-hidden />
                                          Settled
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={p.unsettled_value <= 0}
                                      loading={settlingSupplierId === p.supplier_id}
                                      onClick={() => handleSettle(p.supplier_id)}
                                    >
                                      {settlingSupplierId !== p.supplier_id && <HandCoins aria-hidden />}
                                      Settle now
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <Pagination
                          currentPage={positionsPage}
                          totalPages={positionsTotalPages}
                          totalItems={positionsTotalCount}
                          itemsPerPage={POSITIONS_PAGE_SIZE}
                          startIndex={positionsStartIndex}
                          onPageChange={handlePositionsPageChange}
                          className="mt-4"
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settlements" className="min-w-0">
                <Card>
                  <CardHeader>
                    <CardTitle>Settlement history</CardTitle>
                    <CardDescription>Every settlement posted to a supplier&apos;s payable.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {settlementsLoading ? (
                      <SkeletonTable rows={4} cols={4} />
                    ) : settlements.length === 0 ? (
                      <EmptyState
                        size="compact"
                        icon={History}
                        title="No settlements yet"
                        description="Once consignment stock sells, use Settle now on the Outstanding tab to post what you owe."
                      />
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                {branchFilter.showBranchColumn && <TableHead>Branch</TableHead>}
                                <TableHead>Supplier</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead className="text-right">Value (NPR)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedSettlements.map((s) => (
                                <TableRow key={s.id}>
                                  <TableCell className="num whitespace-nowrap">{s.settlement_date}</TableCell>
                                  {branchFilter.showBranchColumn && (
                                    <TableCell className="whitespace-nowrap">{branchFilter.branchName(s.branch_id)}</TableCell>
                                  )}
                                  <TableCell>{s.supplier_name || supplierNameById[s.supplier_id] || "—"}</TableCell>
                                  <TableCell className="num text-right">{s.total_quantity}</TableCell>
                                  <TableCell className="num text-right">{fmt(s.total_value)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <Pagination
                          currentPage={settlementsCurrentPage}
                          totalPages={settlementsTotalPages}
                          totalItems={settlementsTotalCount}
                          itemsPerPage={SETTLEMENTS_PAGE_SIZE}
                          startIndex={settlementsStartIndex}
                          onPageChange={handleSettlementsPageChange}
                          className="mt-4"
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </Section>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
