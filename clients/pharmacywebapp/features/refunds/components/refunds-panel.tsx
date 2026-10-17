"use client"

/**
 * Body of the "Refunds" tab on /dashboard/returns?view=refunds: refund KPIs plus
 * the refunds table (approve / reject / complete, credit notes, delete). Session
 * gating and the page header live in ReturnsRefundsView.
 */

import { CheckCircle2, Clock, Wallet, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useCurrency } from "@/lib/contexts/currency-context"
import RefundsTable from "@/features/refunds/components/refunds-table"
import { useRefundsStats } from "@/features/refunds/hooks/use-refunds"

interface RefundsPanelProps {
  /** False until the session check finishes; the table shows a skeleton meanwhile. */
  isReady: boolean
  /** "New refund" modal — the page header owns the primary action. */
  isCreateOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  /** Branch scope for stats and the table; undefined = the server's default for this user. */
  branchId?: string
}

export function RefundsPanel({ isReady, isCreateOpen, onCreateOpenChange, branchId }: RefundsPanelProps) {
  const { formatCurrency } = useCurrency()

  const { data: statsResponse, isLoading: statsLoading } = useRefundsStats({ branchId })
  const stats = statsResponse?.data?.[0] || {
    total: 0,
    totalRefundAmount: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0,
  }
  const kpiLoading = !isReady || statsLoading

  return (
    <>
      <Section spacing="lg">
        <StatGrid cols={5}>
          <StatCard
            label="Total refunded"
            value={formatCurrency(stats.totalRefundAmount)}
            hint={`Paid out on ${stats.completed} completed ${stats.completed === 1 ? "refund" : "refunds"}`}
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
            label="Approved"
            value={stats.approved}
            hint="Approved, not yet completed"
            icon={CheckCircle2}
            tone="info"
            loading={kpiLoading}
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            hint="Processed refunds"
            icon={CheckCircle2}
            tone="success"
            loading={kpiLoading}
          />
          <StatCard
            label="Rejected"
            value={stats.rejected}
            hint="Not paid out"
            icon={XCircle}
            tone={stats.rejected > 0 ? "danger" : "default"}
            loading={kpiLoading}
          />
        </StatGrid>
      </Section>

      <Section spacing="lg">
        <Card>
          <CardHeader>
            <CardTitle>All refunds</CardTitle>
            <CardDescription>Approve or reject pending refunds from each row&apos;s menu.</CardDescription>
          </CardHeader>
          <CardContent>
            {isReady ? (
              <RefundsTable filters={branchId ? { branchId } : undefined} isCreateOpen={isCreateOpen} onCreateOpenChange={onCreateOpenChange} hideCreateAction />
            ) : (
              <SkeletonTable rows={6} cols={6} />
            )}
          </CardContent>
        </Card>
      </Section>
    </>
  )
}
