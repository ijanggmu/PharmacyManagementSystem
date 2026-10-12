"use client"

/**
 * Body of the "Returns" tab on /dashboard/returns: customer-return KPIs plus the
 * customer / supplier returns lists. Session gating and the page header live in
 * ReturnsRefundsView; this panel owns only returns-specific UI.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Clock, RotateCcw, Wallet } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrency } from "@/lib/contexts/currency-context"
import ReturnsTable from "@/features/returns/components/returns-table"
import CreateReturnModal from "@/features/returns/components/create-return-modal"
import ProcessReturnModal from "@/features/returns/components/process-return-modal"
import { FindSaleDialog } from "@/features/returns/components/find-sale-dialog"
import type { Sale } from "@/features/sales/api-client"
import { SupplierReturnsPanel } from "@/features/returns/components/supplier-returns-panel"
import { invalidateAfterSupplierReturn } from "@/features/returns/lib/supplier-return-cache"
import { useReturnsStats } from "@/features/returns/hooks/use-returns"
import type { ReturnsSubTab } from "@/features/returns/lib/returns-view"

interface ReturnsPanelProps {
  /** False until the session check finishes; tables show skeletons meanwhile. */
  isReady: boolean
  subTab: ReturnsSubTab
  onSubTabChange: (tab: ReturnsSubTab) => void
  /** Create flow for the active sub-tab: customer = find a sale then record the return; supplier = debit note. */
  isCreateOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  /** Branch scope for stats and the table; undefined = the server's default for this user. */
  branchId?: string
}

export function ReturnsPanel({ isReady, subTab, onSubTabChange, isCreateOpen, onCreateOpenChange, branchId }: ReturnsPanelProps) {
  const queryClient = useQueryClient()
  const { formatCurrency } = useCurrency()

  const { data: statsResponse, isLoading: statsLoading } = useReturnsStats({ branchId })
  const stats = statsResponse?.data?.[0] || {
    total: 0,
    totalRefundAmount: 0,
    completed: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  }
  const kpiLoading = !isReady || statsLoading
  const [returnSale, setReturnSale] = useState<Sale | null>(null)

  // The modal creates a supplier return: show the user where it landed.
  const handleCreated = () => {
    void invalidateAfterSupplierReturn(queryClient)
    onSubTabChange("supplier")
  }

  const handleCustomerReturned = () => {
    setReturnSale(null)
    queryClient.invalidateQueries({ queryKey: ["returns"] })
    queryClient.invalidateQueries({ queryKey: ["sales"] })
  }

  const kpis = (
      <Section spacing="lg">
        <StatGrid cols={4}>
          <StatCard label="Customer returns" value={stats.total} hint="All time" icon={RotateCcw} loading={kpiLoading} />
          <StatCard
            label="Returned value"
            value={formatCurrency(stats.totalRefundAmount)}
            hint="Total value of returned items"
            icon={Wallet}
            tone="primary"
            loading={kpiLoading}
          />
          <StatCard
            label="Pending"
            value={stats.pending}
            hint={stats.pending > 0 ? "Waiting for approval" : "Nothing waiting"}
            icon={Clock}
            tone={stats.pending > 0 ? "warning" : "default"}
            loading={kpiLoading}
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            hint="Processed and closed"
            icon={CheckCircle2}
            tone="success"
            loading={kpiLoading}
          />
        </StatGrid>
      </Section>
  )

  return (
    <>
      <Section spacing="lg">
        <Tabs value={subTab} onValueChange={(v) => onSubTabChange(v === "supplier" ? "supplier" : "customer")}>
          <TabsList className="mb-4">
            <TabsTrigger value="customer">Customer returns</TabsTrigger>
            <TabsTrigger value="supplier">Supplier returns</TabsTrigger>
          </TabsList>
          <TabsContent value="customer">
            {kpis}
            <Card>
              <CardHeader>
                <CardTitle>Customer returns</CardTitle>
                <CardDescription>
                  Medicine coming back against a sale, walk-in sales included. Use{" "}
                  <span className="font-medium text-foreground">New customer return</span> to find the sale by invoice
                  number or customer. Sealed packs go back into stock; opened or damaged ones are quarantined.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isReady ? (
                  <ReturnsTable filters={branchId ? { branchId } : undefined} onNewReturn={() => onCreateOpenChange(true)} />
                ) : (
                  <SkeletonTable rows={6} cols={6} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="supplier">
            <Card>
              <CardHeader>
                <CardTitle>Supplier returns &middot; debit notes</CardTitle>
                <CardDescription>
                  Goods sent back to a supplier. Each one is a numbered debit note, final when posted: stock goes down,
                  the supplier&apos;s payable drops by cost plus VAT, and it appears in the IRD purchase register.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isReady ? (
                  <SupplierReturnsPanel onNewReturn={() => onCreateOpenChange(true)} branchId={branchId} />
                ) : (
                  <SkeletonTable rows={5} cols={5} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <CreateReturnModal
        isOpen={isCreateOpen && subTab === "supplier"}
        onClose={() => onCreateOpenChange(false)}
        onSuccess={handleCreated}
      />
      <FindSaleDialog
        isOpen={isCreateOpen && subTab === "customer"}
        onClose={() => onCreateOpenChange(false)}
        onSelect={(sale) => {
          onCreateOpenChange(false)
          setReturnSale(sale)
        }}
        title="New customer return"
        description="Find the sale the medicine was bought on. Walk-in sales are included."
        branchId={branchId}
      />
      <ProcessReturnModal
        isOpen={returnSale !== null}
        sale={returnSale}
        onClose={() => setReturnSale(null)}
        onSuccess={handleCustomerReturned}
      />
    </>
  )
}
