"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import PrescriptionTable from "@/components/prescription-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"
import { usePrescriptionStats } from "@/lib/hooks/use-prescriptions"

export default function PrescriptionsPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get prescription stats
  const { data: statsResponse } = usePrescriptionStats()
  const stats = statsResponse?.data?.[0] || {
    total: 0,
    pending: 0,
    filled: 0,
    partially_filled: 0,
    cancelled: 0
  }

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
            <h1 className="text-3xl font-bold tracking-tight">Prescriptions</h1>
            <p className="text-muted-foreground">
              Manage prescriptions and medication orders
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Prescriptions</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                All prescriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting processing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Filled</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.filled}</div>
              <p className="text-xs text-muted-foreground">
                Completed prescriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Partially Filled</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.partially_filled}</div>
              <p className="text-xs text-muted-foreground">
                Incomplete orders
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.cancelled}</div>
              <p className="text-xs text-muted-foreground">
                Cancelled prescriptions
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Prescription Table */}
        <Card>
          <CardHeader>
            <CardTitle>Prescription Management</CardTitle>
            <CardDescription>
              View, process, and manage all prescriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrescriptionTable />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
