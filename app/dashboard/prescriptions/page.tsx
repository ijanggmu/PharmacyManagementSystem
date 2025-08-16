import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import PrescriptionTable from "@/components/prescription-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"

export default async function PrescriptionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get prescriptions with customer and prescription items information
  const { data: prescriptions, error } = await supabase
    .from("prescriptions")
    .select(`
      *,
      customers (first_name, last_name, phone),
      prescription_items (
        id,
        quantity_prescribed,
        quantity_dispensed,
        medicines (name, strength, form)
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching prescriptions:", error)
  }

  const totalPrescriptions = prescriptions?.length || 0
  const pendingPrescriptions = prescriptions?.filter((p) => p.status === "pending").length || 0
  const filledPrescriptions = prescriptions?.filter((p) => p.status === "filled").length || 0
  const partiallyFilledPrescriptions = prescriptions?.filter((p) => p.status === "partially_filled").length || 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Prescription Management</h1>
            <p className="text-gray-600">Process and track prescription orders</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/prescriptions/add">
              <Plus className="h-4 w-4 mr-2" />
              New Prescription
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Prescriptions</CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPrescriptions}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingPrescriptions}</div>
              <p className="text-xs text-muted-foreground">Awaiting processing</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Filled</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filledPrescriptions}</div>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Partially Filled</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{partiallyFilledPrescriptions}</div>
              <p className="text-xs text-muted-foreground">Incomplete</p>
            </CardContent>
          </Card>
        </div>

        {/* Prescription List */}
        <Card>
          <CardHeader>
            <CardTitle>Prescription Orders</CardTitle>
            <CardDescription>View and manage all prescription orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search prescriptions..." className="pl-10" />
              </div>
              <Button variant="outline">Filter by Status</Button>
            </div>

            <PrescriptionTable prescriptions={prescriptions || []} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
