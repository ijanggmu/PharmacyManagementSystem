"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import CustomerTable from "@/components/customer-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Users, UserCheck, Calendar } from "lucide-react"
import Link from "next/link"
import { useCustomers } from "@/lib/hooks/use-customers"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"

export default function CustomersPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [shouldOpenCreateModal, setShouldOpenCreateModal] = useState(false)

  // Get customer stats
  const { data: allCustomersResponse } = useCustomers({})
  const { data: activeCustomersResponse } = useCustomers({ status: "active" })
  const { data: inactiveCustomersResponse } = useCustomers({ status: "inactive" })

  const allCustomers = allCustomersResponse?.data || []
  const activeCustomers = activeCustomersResponse?.data || []
  const inactiveCustomers = inactiveCustomersResponse?.data || []

  // Calculate new customers this month
  const newCustomersThisMonth = allCustomers.filter(customer => {
    const createdAt = new Date(customer.created_at)
    const now = new Date()
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
    return createdAt >= monthAgo
  }).length

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

  // Check for action query parameter to open create modal
  useEffect(() => {
    const action = searchParams.get("action")
    if (action === "create") {
      setShouldOpenCreateModal(true)
      // Remove query parameter from URL without reload
      router.replace("/dashboard/customers", { scroll: false })
    }
  }, [searchParams, router])

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading customers..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Customers"
          description="Manage your pharmacy customers and their information"
        />

        <Section spacing="lg">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allCustomers.length}</div>
              <p className="text-xs text-muted-foreground">
                All registered customers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCustomers.length}</div>
              <p className="text-xs text-muted-foreground">
                Customers with recent activity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New This Month</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{newCustomersThisMonth}</div>
              <p className="text-xs text-muted-foreground">
                Customers joined this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inactive Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inactiveCustomers.length}</div>
              <p className="text-xs text-muted-foreground">
                No recent activity
              </p>
            </CardContent>
          </Card>
          </div>
        </Section>

        <Section spacing="lg">
          {/* Customer Table */}
          <Card>
          <CardHeader>
            <CardTitle>Customer Management</CardTitle>
            <CardDescription>
              View, edit, and manage all customer information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerTable openCreateModal={shouldOpenCreateModal} onCreateModalClose={() => setShouldOpenCreateModal(false)} />
          </CardContent>
        </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
