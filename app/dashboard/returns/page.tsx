import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Package, AlertTriangle, Clock, CheckCircle } from "lucide-react"
import Link from "next/link"
import ReturnsTable from "@/components/returns-table"
import DashboardLayout from "@/components/dashboard-layout"
import { CurrencyDisplay } from "@/components/currency-display"

async function getReturns() {
  const supabase = await createClient()

  const { data: returns, error } = await supabase
    .from("medicine_returns")
    .select(`
      *,
      medicines (
        name,
        generic_name,
        strength,
        form
      ),
      suppliers (
        name,
        contact_person
      ),
      users (
        full_name
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching returns:", error)
    return []
  }

  return returns || []
}

async function getReturnStats() {
  const supabase = await createClient()

  const { data: stats } = await supabase.from("medicine_returns").select("status, return_reason, total_cost")

  const totalReturns = stats?.length || 0
  const pendingReturns = stats?.filter((s: any) => s.status === "pending").length || 0
  const completedReturns = stats?.filter((s: any) => s.status === "completed").length || 0
  const totalValue = stats?.reduce((sum: number, s: any) => sum + (Number(s.total_cost) || 0), 0) || 0

  return {
    totalReturns,
    pendingReturns,
    completedReturns,
    totalValue,
  }
}

export default async function ReturnsPage() {
  const [returns, stats] = await Promise.all([getReturns(), getReturnStats()])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Medicine Returns</h1>
            <p className="text-gray-600">Manage returns to suppliers for expired or defective medicines</p>
          </div>
          <Link href="/dashboard/returns/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Return
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
              <Package className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalReturns}</div>
              <p className="text-xs text-gray-600">All time returns</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Returns</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingReturns}</div>
              <p className="text-xs text-gray-600">Awaiting processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Returns</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completedReturns}</div>
              <p className="text-xs text-gray-600">Successfully processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600"><CurrencyDisplay amount={stats.totalValue.toFixed(2)}/></div>
              <p className="text-xs text-gray-600">Value of returned items</p>
            </CardContent>
          </Card>
        </div>

        {/* Returns Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading returns...</div>}>
              <ReturnsTable returns={returns} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
