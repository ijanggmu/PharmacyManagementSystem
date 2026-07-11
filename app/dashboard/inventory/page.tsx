"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedInventoryTable from "@/features/medicines/components/enhanced-inventory-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, AlertTriangle, Clock, Package, DollarSign } from "lucide-react"
import Link from "next/link"
import { CurrencyDisplay } from "@/components/currency-display"
import ExpiredTable from "@/features/medicines/components/expired-table"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"
import { useInventoryStats } from "@/features/medicines/hooks/use-medicines"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"

export default function InventoryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [shouldOpenCreateModal, setShouldOpenCreateModal] = useState(false)

  // Cached, invalidated on create/update/delete elsewhere (see medicineKeys.stats()) —
  // replaces the previous approach of fetching up to 5000 full medicine rows (with
  // category/supplier joins) on every page load just to compute these 4 numbers.
  const { data: statsResult, isLoading } = useInventoryStats()
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
      const event = new CustomEvent('inventory-filter', { detail: { filter: stockFilter === 'low' ? 'low-stock' : stockFilter } })
      window.dispatchEvent(event)
    }

    if (expiryFilter) {
      const event = new CustomEvent('inventory-filter', { detail: { filter: expiryFilter === 'expiring' ? 'expiring-soon' : expiryFilter } })
      window.dispatchEvent(event)
    }
  }, [searchParams, router])

  // Listen for refresh events (other components dispatch this after mutating medicines)
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
    }

    window.addEventListener('refresh-medicines', handleRefresh)
    return () => {
      window.removeEventListener('refresh-medicines', handleRefresh)
    }
  }, [queryClient])

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading inventory..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  const totalCount = stats?.total ?? 0
  const lowStockCount = stats?.lowStock ?? 0
  const expiringCount = stats?.expiringSoon ?? 0
  const expiredCount = stats?.expired ?? 0

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Inventory Management"
          description="Manage your pharmacy's medicine inventory"
        />

        <Section spacing="lg">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'reset' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground">Active medicines</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              // This will be handled by the inventory table component
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'low-stock' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockCount}</div>
              <p className="text-xs text-muted-foreground">Need restocking</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'expiring-soon' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringCount}</div>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'expired' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiredCount}</div>
              <p className="text-xs text-muted-foreground">Expired medicines</p>
            </CardContent>
          </Card>
          </div>
        </Section>

        {/* Alerts */}
        {(lowStockCount > 0 || expiringCount > 0 || expiredCount > 0) && (
          <Section spacing="lg">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {lowStockCount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-5 w-5" />
                      Low Stock Alert
                    </CardTitle>
                    <CardDescription className="text-red-600">
                      {lowStockCount} item{lowStockCount > 1 ? "s" : ""} need restocking
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </Section>
        )}

        <Section spacing="lg">
          {/* Inventory Table */}
          <Card>
          <CardHeader>
            <CardTitle>Medicine Inventory</CardTitle>
            <CardDescription>View and manage all medicines with filtering and expiry tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedInventoryTable openCreateModal={shouldOpenCreateModal} onCreateModalClose={() => setShouldOpenCreateModal(false)} />
          </CardContent>
        </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
