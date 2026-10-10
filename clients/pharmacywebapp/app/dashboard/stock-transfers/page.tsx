/**
 * Inter-branch stock transfer — see audit Module 03: the previous stock_transfers
 * table was dropped as "unused" with no replacement, so branch-to-branch stock
 * movement had no system-tracked, audited path. This gives it one.
 */

"use client"

import { Suspense, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeftRight, History, Plus } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useTabParam } from "@/hooks/use-tab-param"
import { medicinesApi } from "@/features/medicines/api-client"
import { withBranchNames, type StockTransfer } from "@/features/inventory/api-client-stock-transfers"
import {
  useCancelStockTransfer,
  useReceiveStockTransfer,
  useStockTransferCount,
} from "@/features/inventory/hooks/use-stock-transfers"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useBranches } from "@/features/branches/hooks/use-branches"
import { StockTransfersList } from "@/features/inventory/components/stock-transfers/stock-transfers-list"
import { NewTransferForm } from "@/features/inventory/components/stock-transfers/new-transfer-form"
import { StockTransferDetailSheet } from "@/features/inventory/components/stock-transfers/stock-transfer-detail-sheet"
import { CancelTransferDialog } from "@/features/inventory/components/stock-transfers/transfer-parts"

const TRANSFER_TABS = ["transfers", "new"] as const

export default function StockTransfersPage() {
  return (
    <Suspense fallback={null}>
      <StockTransfersContent />
    </Suspense>
  )
}

function StockTransfersContent() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useTabParam(TRANSFER_TABS)
  const branchAccess = useBranchAccess()
  const branchesQuery = useBranches()
  const branches = useMemo(
    () => (branchesQuery.data ?? []).map((b) => ({ id: b.id, name: b.name, code: b.code })),
    [branchesQuery.data],
  )

  const medicinesQuery = useQuery({
    queryKey: ["medicines", "transfer-picker"],
    queryFn: async () => (await medicinesApi.getMedicines({ limit: 1000, sortBy: "name", sortOrder: "asc" })).data ?? [],
    enabled: activeTab === "new",
    staleTime: 60 * 1000,
  })

  const inTransit = useStockTransferCount({ status: "in_transit" })
  const receive = useReceiveStockTransfer()
  const cancel = useCancelStockTransfer()

  const [selected, setSelected] = useState<StockTransfer | null>(null)
  const [cancelTarget, setCancelTarget] = useState<StockTransfer | null>(null)

  const handleReceive = async (transfer: StockTransfer) => {
    try {
      await receive.mutateAsync(transfer.id)
      toast({ title: "Transfer received", description: `${transfer.transfer_number} added to destination stock.` })
      setSelected((current) => (current?.id === transfer.id ? null : current))
    } catch (error) {
      toast({
        title: "Failed to receive transfer",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    }
  }

  const handleCancel = async (reason: string) => {
    if (!cancelTarget) return
    try {
      await cancel.mutateAsync({ id: cancelTarget.id, reason })
      toast({ title: "Transfer cancelled", description: "Source stock was restored." })
      setSelected((current) => (current?.id === cancelTarget.id ? null : current))
      setCancelTarget(null)
    } catch (error) {
      toast({
        title: "Failed to cancel transfer",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    }
  }

  const inTransitCount = inTransit.data
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Stock transfers"
          description={
            inTransitCount
              ? `${inTransitCount} transfer${inTransitCount === 1 ? "" : "s"} in transit. Receive them at the destination once the stock arrives.`
              : "Move stock between branches with a full audit trail."
          }
          icon={ArrowLeftRight}
          actions={
            activeTab !== "new" ? (
              <Button onClick={() => setActiveTab("new")}>
                <Plus aria-hidden />
                New transfer
              </Button>
            ) : undefined
          }
        />

        <Section spacing="lg">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
            <TabsList aria-label="Stock transfers">
              <TabsTrigger value="transfers">
                <History aria-hidden />
                Transfers
                {inTransitCount ? (
                  <span className="num ml-1 rounded-full bg-info/15 px-1.5 text-xs text-info" aria-label={`${inTransitCount} in transit`}>
                    {inTransitCount}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="new">
                <Plus aria-hidden />
                New transfer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transfers">
              <StockTransfersList
                branches={branches}
                inTransitCount={inTransitCount}
                onOpen={setSelected}
                onReceive={handleReceive}
                onCancel={setCancelTarget}
                receivingId={receive.isPending ? (receive.variables ?? null) : null}
              />
            </TabsContent>

            <TabsContent value="new">
              <NewTransferForm
                branches={branches}
                medicines={medicinesQuery.data ?? []}
                medicinesLoading={medicinesQuery.isLoading}
                branchAccess={branchAccess}
                onCreated={() => setActiveTab("transfers")}
              />
            </TabsContent>
          </Tabs>
        </Section>

        <StockTransferDetailSheet
          transfer={selected ? withBranchNames(selected, branches) : null}
          onOpenChange={(open) => !open && setSelected(null)}
          onReceive={handleReceive}
          onCancel={setCancelTarget}
          receiving={receive.isPending && receive.variables === selected?.id}
        />

        <CancelTransferDialog
          transfer={cancelTarget ? withBranchNames(cancelTarget, branches) : null}
          pending={cancel.isPending}
          onConfirm={handleCancel}
          onOpenChange={(open) => !open && setCancelTarget(null)}
        />
      </PageContainer>
    </DashboardLayout>
  )
}
