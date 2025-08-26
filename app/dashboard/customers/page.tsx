"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import CustomerTable from "@/components/customer-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Users, UserCheck, Calendar } from "lucide-react"
import Link from "next/link"
import { useCustomers } from "@/lib/hooks/use-customers"

export default function CustomersPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

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
        window.location.href = "/auth/login"
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
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground">
              Manage your pharmacy customers and their information
            </p>
          </div>
        </div>

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

        {/* Customer Table */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Management</CardTitle>
            <CardDescription>
              View, edit, and manage all customer information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerTable />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
