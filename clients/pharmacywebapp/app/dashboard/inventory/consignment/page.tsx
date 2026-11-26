/**
 * Consignment inventory (2026-09 ERP audit, priority item #8) — supplier-owned
 * stock on the shelf. Receiving here posts no GL/AP entry (ownership hasn't
 * transferred); settling a supplier reads how much has sold since it was last
 * settled and posts a correcting voucher + supplier ledger entry. See
 * lib/server/services/consignment-service.ts.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { TabsContent } from "@/components/ui/tabs"
import { PageTabCount, PageTabs } from "@/components/ui/page-tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"
import { AlertCircle, Boxes, CheckCircle2, HandCoins, History, PackagePlus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { consignmentApi, type ConsignmentPosition, type ConsignmentSettlement } from "@/features/inventory/api-client-consignment"
import { ReceiveConsignmentDialog } from "@/features/inventory/components/receive-consignment-dialog"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCurrency } from "@/lib/contexts/currency-context"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"

/** Positions page from the .NET API — matches the request sent in `fetchPositions`. */
const POSITIONS_PAGE_SIZE = 10

/**
 * Settlements page from the .NET API — now pages for real (`PagedResponse<ConsignmentSettlementDto>`),
 * so each page turn requests only that page, same as positions above.
 */
const SETTLEMENTS_PAGE_SIZE = 10

/** Medicines preloaded for the receive picker; typing searches the rest server-side. */
const MEDICINE_PICKER_PAGE_SIZE = 50

function mergeById<T extends { id: string }>(prev: T[], found: T[]): T[] {
  const seen = new Set(prev.map((item) => item.id))
  return [...prev, ...found.filter((item) => !seen.has(item.id))]
}

export default function ConsignmentInventoryPage() {
  const { toast } = useToast()
  const { formatCurrency } = useCurrency()
  const money = (n: number) => formatCurrency(n)

  const [loading, setLoading] = useState(true)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [medicineSearching, setMedicineSearching] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [positions, setPositions] = useState<ConsignmentPosition[]>([])
  const [positionsPage, setPositionsPage] = useState(1)
  const [positionsTotalCount, setPositionsTotalCount] = useState(0)
  const [positionsTotalPages, setPositionsTotalPages] = useState(1)
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [positionsError, setPositionsError] = useState<string | null>(null)

  const [settlements, setSettlements] = useState<ConsignmentSettlement[]>([])
  const [settlementsPage, setSettlementsPage] = useState(1)
  const [settlementsTotalCount, setSettlementsTotalCount] = useState(0)
  const [settlementsTotalPages, setSettlementsTotalPages] = useState(1)
  const [settlementsLoading, setSettlementsLoading] = useState(false)
  const [settlementsError, setSettlementsError] = useState<string | null>(null)
  // Only the latest request per list may write state (a branch switch can race a page turn).
  const positionsSeq = useRef(0)
  const settlementsSeq = useRef(0)

  const [receiveOpen, setReceiveOpen] = useState(false)

  const [settlingSupplierId, setSettlingSupplierId] = useState<string | null>(null)
  /** The supplier whose settlement is being confirmed, and whether their bill carries VAT. */
  const [settleTarget, setSettleTarget] = useState<{ supplierId: string; amount: number } | null>(null)
  const [settleWithVat, setSettleWithVat] = useState(true)
  // ViewAll users can narrow to one branch; rows then name their branch when several are shown.
  const branchFilter = useBranchFilter()
  const consignmentBranchId = branchFilter.branchId

/** One page of consignment positions, requested fresh from the .NET API — never a full-table walk. */
  const fetchPositions = useCallback(async (page: number) => {
    const seq = ++positionsSeq.current
    setPositionsLoading(true)
    setPositionsError(null)
    const res = await consignmentApi.getPositions({ pageNumber: page, pageSize: POSITIONS_PAGE_SIZE, branchId: consignmentBranchId })
    if (seq !== positionsSeq.current) return
    // A failed load shows an error with retry in the tab, not a toast over an empty list.
    setPositionsError(res.error)
    setPositions(res.data)
    setPositionsTotalCount(res.totalCount)
    setPositionsTotalPages(Math.max(1, res.totalPages))
    setPositionsPage(res.pageNumber)
    setPositionsLoading(false)
  }, [consignmentBranchId])

  /** One page of consignment settlements, requested fresh from the .NET API. */
  const fetchSettlements = useCallback(async (page: number) => {
    const seq = ++settlementsSeq.current
    setSettlementsLoading(true)
    setSettlementsError(null)
    const res = await consignmentApi.getSettlements({ pageNumber: page, pageSize: SETTLEMENTS_PAGE_SIZE, branchId: consignmentBranchId })
    if (seq !== settlementsSeq.current) return
    setSettlementsError(res.error)
    setSettlements(res.data)
    setSettlementsTotalCount(res.totalCount)
    setSettlementsTotalPages(Math.max(1, res.totalPages))
    setSettlementsPage(res.pageNumber)
    setSettlementsLoading(false)
  }, [consignmentBranchId])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [medicinesRes, suppliersRes] = await Promise.all([
        medicinesApi.getMedicines({ limit: MEDICINE_PICKER_PAGE_SIZE, sortBy: "name", sortOrder: "asc" }),
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
  /** One Idempotency-Key per settlement, reused when the same settle action is retried. */
  const settleKeys = useRef(createIdempotencyKeyTracker())
  useEffect(() => {
    if (firstBranchScope.current) {
      firstBranchScope.current = false
      return
    }
    void Promise.all([fetchPositions(1), fetchSettlements(1)])
  }, [consignmentBranchId, fetchPositions, fetchSettlements])

  /** The receive picker searches the whole catalogue server-side; matches join the preloaded page. */
  const handleMedicineSearch = async (query: string) => {
    if (!query) return
    setMedicineSearching(true)
    try {
      const res = await medicinesApi.getMedicines({ search: query, limit: MEDICINE_PICKER_PAGE_SIZE, sortBy: "name", sortOrder: "asc" })
      setMedicines((prev) => mergeById(prev, res.data || []))
    } catch {
      // A failed live search falls back to the locally filtered list.
    } finally {
      setMedicineSearching(false)
    }
  }

  const handlePositionsPageChange = (page: number) => {
    void fetchPositions(page)
  }

  const handleSettle = async (supId: string, supplierChargesVat: boolean) => {
    setSettlingSupplierId(supId)
    try {
      const { data, error } = await consignmentApi.settle(
        supId,
        undefined,
        settleKeys.current.keyFor(`settle:${supId}:${supplierChargesVat ? "vat" : "net"}`),
        supplierChargesVat,
      )
      if (error) throw new Error(error)
      settleKeys.current.reset()
      if (!data?.settlementId) {
        toast({ title: "Nothing to settle", description: "No consignment stock has sold since the last settlement." })
      } else {
        toast({ title: "Settled", description: `${data.totalQuantity ?? 0} unit(s) — ${money(data.totalValue)} posted to the supplier's payable.` })
      }
      // The settlement changes amounts owed on this page and adds a row to settlement history.
      // A new settlement sorts newest-first, so it lands on page 1.
      await Promise.all([fetchPositions(positionsPage), fetchSettlements(1)])
    } catch (error) {
      toast({ title: "Settlement failed", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setSettlingSupplierId(null)
      setSettleTarget(null)
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
          onMedicineSearch={handleMedicineSearch}
          medicineSearching={medicineSearching}
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
            <PageTabs
              label="Consignment views"
              param="view"
              defaultValue="outstanding"
              items={[
                {
                  value: "outstanding",
                  label: "Outstanding",
                  badge: <PageTabCount count={positionsTotalCount} label="consignment positions" />,
                },
                {
                  value: "settlements",
                  label: "Settlements",
                  badge: <PageTabCount count={settlementsTotalCount} label="settlements" />,
                },
              ]}
            >

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
                    ) : positionsError ? (
                      <ErrorState
                        size="compact"
                        title="Couldn't load consignment stock"
                        message={positionsError}
                        onRetry={() => void fetchPositions(positionsPage)}
                      />
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
                                <TableHead className="text-right">Value due</TableHead>
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
                                      {money(p.unsettled_value)}
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
                                      onClick={() => {
                                        setSettleWithVat(true)
                                        setSettleTarget({ supplierId: p.supplier_id, amount: p.unsettled_value })
                                      }}
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
                    ) : settlementsError ? (
                      <ErrorState
                        size="compact"
                        title="Couldn't load settlement history"
                        message={settlementsError}
                        onRetry={() => void fetchSettlements(settlementsPage)}
                      />
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
                                <TableHead className="text-right">Value</TableHead>
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
                                  <TableCell className="num text-right">{money(s.total_value)}</TableCell>
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
            </PageTabs>
          </Section>
        )}
      </PageContainer>
      <ConfirmDialog
        isOpen={settleTarget !== null}
        onClose={() => setSettleTarget(null)}
        onConfirm={() => settleTarget && void handleSettle(settleTarget.supplierId, settleWithVat)}
        title="Settle consignment?"
        variant="default"
        loading={settlingSupplierId !== null}
        confirmText="Settle now"
        description={
          <div className="space-y-3">
            <p>
              Stock sold since the last settlement ({money(settleTarget?.amount ?? 0)} at cost) is billed to the
              supplier&apos;s payable.
            </p>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch
                id="settle-with-vat"
                checked={settleWithVat}
                onCheckedChange={setSettleWithVat}
                aria-describedby="settle-with-vat-hint"
              />
              <div className="space-y-1">
                <Label htmlFor="settle-with-vat" className="text-foreground">Supplier&apos;s bill includes VAT</Label>
                <p id="settle-with-vat-hint" className="text-xs">
                  {settleWithVat
                    ? "VAT is added on VAT-able medicines and recorded as input VAT you can claim."
                    : "The supplier isn't VAT-registered: the settlement is the cost only, with no input VAT."}
                </p>
              </div>
            </div>
          </div>
        }
      />
    </DashboardLayout>
  )
}
