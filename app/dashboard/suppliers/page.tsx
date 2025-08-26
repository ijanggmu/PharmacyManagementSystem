"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import SupplierTable from "@/components/supplier-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CheckCircle, AlertCircle, TrendingUp } from "lucide-react"
import { useSuppliers } from "@/lib/hooks/use-suppliers"

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
            <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
            <p className="text-muted-foreground">
              Manage your pharmacy suppliers and vendor information
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allSuppliers.length}</div>
              <p className="text-xs text-muted-foreground">
                All registered suppliers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSuppliers.length}</div>
              <p className="text-xs text-muted-foreground">
                Complete information
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Incomplete</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{incompleteSuppliers.length}</div>
              <p className="text-xs text-muted-foreground">
                Missing information
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+12%</div>
              <p className="text-xs text-muted-foreground">
                From last month
              </p>
            </CardContent>
          </Card>
        </div>

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
      </div>
    </DashboardLayout>
  )
}
