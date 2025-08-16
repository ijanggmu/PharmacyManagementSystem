import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import CustomerTable from "@/components/customer-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Users, UserCheck, Calendar } from "lucide-react"
import Link from "next/link"

export default async function CustomersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get customers with their prescription and sales history
  const { data: customers, error } = await supabase
    .from("customers")
    .select(`
      *,
      prescriptions (id),
      sales (id, total_amount)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching customers:", error)
  }

  const totalCustomers = customers?.length || 0
  const activeCustomers =
    customers?.filter((customer) => customer.prescriptions?.length > 0 || customer.sales?.length > 0).length || 0
  const newCustomersThisMonth =
    customers?.filter((customer) => {
      const createdAt = new Date(customer.created_at)
      const now = new Date()
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1)
      return createdAt >= monthAgo
    }).length || 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Management</h1>
            <p className="text-gray-600">Manage your pharmacy's customer database</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/customers/add">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCustomers}</div>
              <p className="text-xs text-muted-foreground">Registered customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCustomers}</div>
              <p className="text-xs text-muted-foreground">With purchase history</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New This Month</CardTitle>
              <Calendar className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{newCustomersThisMonth}</div>
              <p className="text-xs text-muted-foreground">Recently registered</p>
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Directory</CardTitle>
            <CardDescription>View and manage all registered customers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search customers..." className="pl-10" />
              </div>
              <Button variant="outline">Filter</Button>
            </div>

            <CustomerTable customers={customers || []} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
