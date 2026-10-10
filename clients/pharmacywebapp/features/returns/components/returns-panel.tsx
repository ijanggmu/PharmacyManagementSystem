"use client"

/**
 * Body of the "Returns" tab on /dashboard/returns: customer-return KPIs plus the
 * customer / supplier returns lists. Session gating and the page header live in
 * ReturnsRefundsView; this panel owns only returns-specific UI.
 */

import Link from "next/link"
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
import { SupplierReturnsPanel, supplierReturnsKeys } from "@/features/returns/components/supplier-returns-panel"
import { useReturnsStats } from "@/features/returns/hooks/use-returns"
import type { ReturnsSubTab } from "@/features/returns/lib/returns-view"

interface ReturnsPanelProps {
  /** False until the session check finishes; tables show skeletons meanwhile. */
  isReady: boolean
  subTab: ReturnsSubTab
  onSubTabChange: (tab: ReturnsSubTab) => void
  /** "New supplier return" modal — opened from the page header or the empty state. */
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

  // The modal creates a supplier return: show the user where it landed.
  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: supplierReturnsKeys.all })
    onSubTabChange("supplier")
  }

  return (
    <>
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

      <Section spacing="lg">
        <Tabs value={subTab} onValueChange={(v) => onSubTabChange(v === "supplier" ? "supplier" : "customer")}>
          <TabsList className="mb-4">
            <TabsTrigger value="customer">Customer returns</TabsTrigger>
            <TabsTrigger value="supplier">Supplier returns</TabsTrigger>
          </TabsList>
          <TabsContent value="customer">
            <Card>
              <CardHeader>
                <CardTitle>Customer returns</CardTitle>
                <CardDescription>
                  Returns recorded against a sale. To start one, open{" "}
                  <Link href="/dashboard/sales" className="font-medium text-primary underline-offset-4 hover:underline">
                    Sales
                  </Link>{" "}
                  and choose <span className="font-medium text-foreground">Process return</span> on the sale.
                </CardDescription>
              </CardHeader>
              <CardContent>{isReady ? <ReturnsTable filters={branchId ? { branchId } : undefined} /> : <SkeletonTable rows={6} cols={6} />}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="supplier">
            <Card>
              <CardHeader>
                <CardTitle>Supplier returns</CardTitle>
                <CardDescription>
                  Goods sent back to a supplier. Each return is final when recorded: stock goes down and the
                  supplier&apos;s payable is credited.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isReady ? (
                  <SupplierReturnsPanel onNewReturn={() => onCreateOpenChange(true)} />
                ) : (
                  <SkeletonTable rows={5} cols={5} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <CreateReturnModal isOpen={isCreateOpen} onClose={() => onCreateOpenChange(false)} onSuccess={handleCreated} />
    </>
  )
}
