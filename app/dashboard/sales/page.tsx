"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import SalesTable from "@/features/sales/components/sales-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyDisplay } from "@/components/currency-display"
import { DollarSign, TrendingUp, ShoppingCart, CreditCard, Clock, CheckCircle } from "lucide-react"
import { useSalesStats } from "@/features/sales/hooks/use-sales"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"

export default function SalesPage() {
  const [isLoading, setIsLoading] = useState(true)

  // Get sales stats
  const { data: statsResponse } = useSalesStats()
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
      const res = await fetch("/api/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsLoading(false)
    }
    checkUser()
  }, [])

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading sales..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Sales"
          description="Manage sales transactions and revenue tracking"
        />

        <Section spacing="lg">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                All time sales
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay amount={stats.totalRevenue.toString()} />
              </div>
              <p className="text-xs text-muted-foreground">
                All time revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todaySales}</div>
              <p className="text-xs text-muted-foreground">
                Sales today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <CurrencyDisplay amount={stats.todayRevenue.toString()} />
              </div>
              <p className="text-xs text-muted-foreground">
                Revenue today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingPayments}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting payment
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Payments</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedPayments}</div>
              <p className="text-xs text-muted-foreground">
                Successfully paid
              </p>
            </CardContent>
          </Card>
          </div>
        </Section>

        <Section spacing="lg">
          {/* Sales Table */}
          <Card>
          <CardHeader>
            <CardTitle>Sales Management</CardTitle>
            <CardDescription>
              View, manage, and track all sales transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalesTable />
          </CardContent>
        </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
