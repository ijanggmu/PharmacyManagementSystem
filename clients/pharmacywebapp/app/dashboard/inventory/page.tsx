"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedInventoryTable from "@/features/medicines/components/enhanced-inventory-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, ArrowRight, CalendarX, Clock, ClipboardList, Package, PackageMinus } from "lucide-react"
import Link from "next/link"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { useInventoryStats } from "@/features/medicines/hooks/use-medicines"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { useHasPermission } from "@/lib/hooks/use-has-permission"

type InventoryFilter = "reset" | "low-stock" | "expiring-soon" | "expired"

function dispatchInventoryFilter(filter: string) {
  window.dispatchEvent(new CustomEvent("inventory-filter", { detail: { filter } }))
}

export default function InventoryPage() {
  const searchParams = useSearchParams()
  // Same gate as the Purchase orders menu item: a cashier sees what is low but can't order it.
  const { allowed: canCreateMedicines } = useHasPermission("Permissions.Inventory.Medicines.Create")
  const { allowed: canUpdateMedicines } = useHasPermission("Permissions.Inventory.Medicines.Update")
  const canOrder = canCreateMedicines || canUpdateMedicines
  const router = useRouter()
  const queryClient = useQueryClient()
  const [shouldOpenCreateModal, setShouldOpenCreateModal] = useState(false)
  // Which stat card filter is currently applied to the table ("reset" = no card filter).
  const [activeFilter, setActiveFilter] = useState<InventoryFilter>("reset")

  // Cached, invalidated on create/update/delete elsewhere (see medicineKeys.stats()) —
  // replaces the previous approach of fetching up to 5000 full medicine rows (with
  // category/supplier joins) on every page load just to compute these 4 numbers.
  // ViewAll users can look at one branch's stock; everyone else is pinned to their own.
  const branchFilter = useBranchFilter()
  const { data: statsResult, isLoading } = useInventoryStats(branchFilter.branchId)
  const stats = statsResult?.data

  // Check for action query parameter to open create modal
  useEffect(() => {
    const action = searchParams.get("action")
    const stockFilter = searchParams.get("stockFilter")
    const expiryFilter = searchParams.get("expiryFilter")

    if (action === "create") {
      setShouldOpenCreateModal(true)
      // Remove query parameter from URL without reload
      router.replace("/dashboard/inventory", { scroll: false })
    }

    // Apply filters from URL parameters
    if (stockFilter) {
      const filter = stockFilter === "low" ? "low-stock" : stockFilter
      dispatchInventoryFilter(filter)
      if (filter === "low-stock") setActiveFilter("low-stock")
    }

    if (expiryFilter) {
      const filter = expiryFilter === "expiring" ? "expiring-soon" : expiryFilter
      dispatchInventoryFilter(filter)
      if (filter === "expiring-soon" || filter === "expired") setActiveFilter(filter)
    }
  }, [searchParams, router])

  // Listen for refresh events (other components dispatch this after mutating medicines)
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
    }

    window.addEventListener("refresh-medicines", handleRefresh)
    return () => {
      window.removeEventListener("refresh-medicines", handleRefresh)
    }
  }, [queryClient])

  const applyFilter = (filter: InventoryFilter) => {
    // Clicking the active card again clears it back to "all medicines".
    const next = filter !== "reset" && activeFilter === filter ? "reset" : filter
    setActiveFilter(next)
    dispatchInventoryFilter(next)
  }

  const totalCount = stats?.total ?? 0
  const lowStockCount = stats?.lowStock ?? 0
  const expiringCount = stats?.expiringSoon ?? 0
  const expiredCount = stats?.expired ?? 0

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Inventory"
          icon={Package}
          description="Track stock levels, expiry dates and shelf locations for every medicine you sell."
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/dashboard/inventory/movements">Movement history</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/inventory/expired">Expired stock</Link>
              </Button>
            </>
          }
        />

        <Section spacing="lg">
          <StatGrid cols={4}>
            <StatCard
              label="Total medicines"
              value={totalCount.toLocaleString()}
              hint="Active medicines — click to show all"
              icon={Package}
              tone="primary"
              loading={isLoading}
              onClick={() => applyFilter("reset")}
              active={activeFilter === "reset"}
            />
            <StatCard
              label="Low stock"
              value={lowStockCount.toLocaleString()}
              hint="At or below reorder level"
              icon={PackageMinus}
              tone="warning"
              loading={isLoading}
              onClick={() => applyFilter("low-stock")}
              active={activeFilter === "low-stock"}
            />
            <StatCard
              label="Expiring soon"
              value={expiringCount.toLocaleString()}
              hint="Within the next 30 days"
              icon={Clock}
              tone="warning"
              loading={isLoading}
              onClick={() => applyFilter("expiring-soon")}
              active={activeFilter === "expiring-soon"}
            />
            <StatCard
              label="Expired"
              value={expiredCount.toLocaleString()}
              hint="Past expiry — cannot be sold"
              icon={CalendarX}
              tone="danger"
              loading={isLoading}
              onClick={() => applyFilter("expired")}
              active={activeFilter === "expired"}
            />
          </StatGrid>
        </Section>

        {/* Actionable alerts — only when something needs attention */}
        {!isLoading && (lowStockCount > 0 || expiredCount > 0) && (
          <Section spacing="lg">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {lowStockCount > 0 && (
                <div
                  role="status"
                  className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground">
                        {plural(lowStockCount, "medicine needs", "medicines need")} restocking
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {canOrder
                          ? "Review them below, then raise a purchase order with your supplier."
                          : "Review them below and tell your manager what to reorder."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-8">
                    <Button variant="outline" size="sm" onClick={() => applyFilter("low-stock")}>
                      Review low stock
                    </Button>
                    {canOrder && (
                      <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/purchases">
                          <ClipboardList aria-hidden />
                          Create purchase order
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {expiredCount > 0 && (
                <div
                  role="status"
                  className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
                >
                  <div className="flex items-start gap-3">
                    <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground">
                        {plural(expiredCount, "medicine has", "medicines have")} expired stock
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expired batches are blocked from sale. Write them off to keep stock and accounts accurate.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-8">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/inventory/expired">
                        Review expired stock
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        <Section spacing="lg">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Medicines</CardTitle>
                  <CardDescription>
                    Search, filter by category, stock or expiry, and open a medicine to edit it. Press Ctrl/⌘+Shift+M to add one.
                  </CardDescription>
                </div>
                <BranchFilterSelect filter={branchFilter} id="inventory-branch" label="Stock at" />
              </div>
            </CardHeader>
            <CardContent>
              <EnhancedInventoryTable
                filters={branchFilter.branchId ? { branchId: branchFilter.branchId } : undefined}
                branchStockLabel={branchFilter.branchId ? branchFilter.branchName(branchFilter.branchId) : undefined}
                openCreateModal={shouldOpenCreateModal}
                onCreateModalClose={() => setShouldOpenCreateModal(false)}
              />
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
