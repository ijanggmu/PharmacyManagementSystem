"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import SalesTable from "@/features/sales/components/sales-table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CurrencyDisplay } from "@/components/currency-display"
import { Wallet, TrendingUp, ShoppingCart, Clock, CheckCircle2, Receipt } from "lucide-react"
import { useSalesStats } from "@/features/sales/hooks/use-sales"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useBranchFilter } from "@/features/branches/components/branch-filter"

export default function SalesPage() {
  const [isLoading, setIsLoading] = useState(true)
  // "View all in Sales" from a medicine's sales history links here with ?medicineId=.
  // Read once from the URL (no useSearchParams, which would need a Suspense boundary for prerendering).
  const [initialMedicineId] = useState<string | undefined>(() =>
    typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("medicineId") ?? undefined,
  )

  // Get sales stats
  const { data: statsResponse, isLoading: statsLoading } = useSalesStats()
  const stats = statsResponse?.data?.[0] || {
    total: 0,
    totalRevenue: 0,
    todaySales: 0,
    todayRevenue: 0,
    pendingPayments: 0,
    completedPayments: 0
  }

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsLoading(false)
    }
    checkUser()
  }, [])

  const kpiLoading = isLoading || statsLoading
  // The summary endpoint takes no branch: ViewAll users get every branch, others their own.
  const summaryScope = useBranchFilter()

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Sales"
          icon={ShoppingCart}
          description="Review invoices, track payments and reprint receipts."
          actions={
            <Button asChild title="Open point of sale (Ctrl+K or ⌘K)">
              <Link href="/dashboard/sales/new">
                <ShoppingCart aria-hidden />
                New sale
              </Link>
            </Button>
          }
        />

        <Section spacing="lg">
          <h2 className="sr-only">Sales figures</h2>
          {summaryScope.access.branches.length > 1 && (
            <p className="mb-2 text-xs text-muted-foreground">
              Summary for <span className="font-medium text-foreground">{summaryScope.scopeLabel}</span>
              {summaryScope.showPicker && " — the branch filter below applies to the table only."}
            </p>
          )}
          <StatGrid cols={6}>
            <StatCard
              label="Today's revenue"
              value={<CurrencyDisplay amount={stats.todayRevenue.toString()} />}
              hint="Revenue today"
              icon={Wallet}
              tone="primary"
              loading={kpiLoading}
            />
            <StatCard
              label="Today's sales"
              value={stats.todaySales}
              hint="Invoices today"
              icon={TrendingUp}
              tone="info"
              loading={kpiLoading}
            />
            <StatCard
              label="Total revenue"
              value={<CurrencyDisplay amount={stats.totalRevenue.toString()} />}
              hint="All time"
              icon={Wallet}
              loading={kpiLoading}
            />
            <StatCard
              label="Total sales"
              value={stats.total}
              hint="All time invoices"
              icon={Receipt}
              loading={kpiLoading}
            />
            <StatCard
              label="Pending payments"
              value={stats.pendingPayments}
              hint={stats.pendingPayments > 0 ? "Awaiting payment" : "Nothing outstanding"}
              icon={Clock}
              tone={stats.pendingPayments > 0 ? "warning" : "default"}
              loading={kpiLoading}
            />
            <StatCard
              label="Paid"
              value={stats.completedPayments}
              hint="Fully paid invoices"
              icon={CheckCircle2}
              tone="success"
              loading={kpiLoading}
            />
          </StatGrid>
        </Section>

        <Section spacing="lg">
          <Card className="shadow-none">
            <CardContent>
              {isLoading ? <SkeletonTable rows={6} cols={6} /> : <SalesTable initialMedicineId={initialMedicineId} />}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
