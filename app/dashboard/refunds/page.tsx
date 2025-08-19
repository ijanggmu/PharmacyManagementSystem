import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw, Clock, CheckCircle, DollarSign } from "lucide-react"
import Link from "next/link"
import RefundsTable from "@/components/refunds-table"
import DashboardLayout from "@/components/dashboard-layout"
import { CurrencyDisplay } from "@/components/currency-display"

async function getRefunds() {
  const supabase = await createClient()

  const { data: refunds, error } = await supabase
    .from("sales_refunds")
    .select(`
      *,
      sales (
        sale_number,
        total_amount,
        payment_method,
        sale_date
      ),
      customers (
        first_name,
        last_name,
        phone,
        email
      ),
      users (
        full_name
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching refunds:", error)
    return []
  }

  return refunds || []
}

async function getRefundStats() {
  const supabase = await createClient()

  const { data: stats } = await supabase.from("sales_refunds").select("refund_status, refund_amount, net_refund_amount")

  const totalRefunds = stats?.length || 0
  const pendingRefunds = stats?.filter((s: any) => s.refund_status === "pending").length || 0
  const completedRefunds = stats?.filter((s: any) => s.refund_status === "completed").length || 0
  const totalRefundAmount = stats?.reduce((sum: number, s: any) => sum + (Number(s.refund_amount) || 0), 0) || 0

  return {
    totalRefunds,
    pendingRefunds,
    completedRefunds,
    totalRefundAmount,
  }
}

export default async function RefundsPage() {
  const [refunds, stats] = await Promise.all([getRefunds(), getRefundStats()])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sales Refunds</h1>
            <p className="text-gray-600">Manage customer refunds and returns</p>
          </div>
          <Link href="/dashboard/refunds/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Process Refund
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Refunds</CardTitle>
              <RefreshCw className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRefunds}</div>
              <p className="text-xs text-gray-600">All time refunds</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Refunds</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingRefunds}</div>
              <p className="text-xs text-gray-600">Awaiting processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Refunds</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completedRefunds}</div>
              <p className="text-xs text-gray-600">Successfully processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Refund Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600"><CurrencyDisplay amount={stats.totalRefundAmount.toFixed(2)}/></div>
              <p className="text-xs text-gray-600">Amount refunded</p>
            </CardContent>
          </Card>
        </div>

        {/* Refunds Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Refunds</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading refunds...</div>}>
              <RefundsTable refunds={refunds} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
