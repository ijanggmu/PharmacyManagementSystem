"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import ReturnsTable from "@/features/returns/components/returns-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RotateCcw, RefreshCw, Calendar, DollarSign } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"
import CreateReturnModal from "@/features/returns/components/create-return-modal"
import { useReturnsStats } from "@/features/returns/hooks/use-returns"

export default function ReturnsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Get returns stats
  const { data: statsResponse } = useReturnsStats()
  const stats = statsResponse?.data?.[0] || {
    total: 0,
    totalRefundAmount: 0,
    completed: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  }

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsLoading(false)
    }
    checkUser()
  }, [])

  const handleUpdate = () => {
    // Refetch data when a return is created
    // The ReturnsTable component will handle its own refetch
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading returns..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Returns Management"
          description="View and manage medicine returns"
          actions={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              New Return
            </Button>
          }
        />

        <Section spacing="lg">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">
                  All time returns
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <CurrencyDisplay amount={stats.totalRefundAmount.toString()} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Total returned value
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completed}</div>
                <p className="text-xs text-muted-foreground">
                  Successfully processed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pending}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting processing
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section spacing="lg">
          {/* Returns Table */}
          <Card>
            <CardHeader>
              <CardTitle>Returns Management</CardTitle>
              <CardDescription>
                View, manage, and track all return transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReturnsTable />
            </CardContent>
          </Card>
        </Section>

        {/* Create Return Modal */}
        <CreateReturnModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleUpdate}
        />
      </PageContainer>
    </DashboardLayout>
  )
}
