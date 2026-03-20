"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import SupplierTable from "@/components/supplier-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CheckCircle, AlertCircle, TrendingUp } from "lucide-react"
import { useSuppliers } from "@/lib/hooks/use-suppliers"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"

export default function SuppliersPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get supplier stats
  const { data: allSuppliersResponse } = useSuppliers({})
  const { data: activeSuppliersResponse } = useSuppliers({ status: "active" })
  const { data: incompleteSuppliersResponse } = useSuppliers({ status: "incomplete" })

  const allSuppliers = allSuppliersResponse?.data || []
  const activeSuppliers = activeSuppliersResponse?.data || []
  const incompleteSuppliers = incompleteSuppliersResponse?.data || []

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/?auth=signin"
        return
      }
      setUser(user)
      setIsLoading(false)
    }
    checkUser()
  }, [])

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading suppliers..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Suppliers"
          description="Manage your pharmacy suppliers and vendor information"
        />

        <Section spacing="lg">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{allSuppliers.length}</div>
                <p className="text-xs text-muted-foreground">All registered suppliers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeSuppliers.length}</div>
                <p className="text-xs text-muted-foreground">Complete information</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Incomplete</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{incompleteSuppliers.length}</div>
                <p className="text-xs text-muted-foreground">Missing information</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Growth</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">+12%</div>
                <p className="text-xs text-muted-foreground">From last month</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section spacing="lg">
          {/* Supplier Table */}
          <Card>
            <CardHeader>
              <CardTitle>Supplier Management</CardTitle>
              <p className="text-sm text-muted-foreground">
                View, edit, and manage all supplier information
              </p>
            </CardHeader>
            <CardContent>
              <SupplierTable />
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
