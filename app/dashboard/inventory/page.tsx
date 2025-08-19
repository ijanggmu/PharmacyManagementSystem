import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedInventoryTable from "@/components/enhanced-inventory-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, AlertTriangle, Clock, Package, DollarSign } from "lucide-react"
import Link from "next/link"
import { Medicine } from "@/lib/types"

export default async function InventoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect("/auth/login")
  }

  // Get medicines with category and supplier information
  const { data: medicines, error } = await supabase
    .from("medicines")
    .select(`
      *,
      categories (name),
      suppliers (name)
    `)
    .order("name")

  if (error) {
    console.error("Error fetching medicines:", error)
    // In a production app, you might want to redirect to an error page
    // or show a user-friendly error message
    throw new Error("Failed to load inventory data. Please try again later.")
  }

  const currentDate = new Date()
  const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  const lowStockCount = medicines?.filter((med: Medicine) => med.stock_quantity <= med.minimum_stock).length || 0
  const expiringCount =
    medicines?.filter((med: Medicine) => {
      if (!med.expiry_date) return false
      const expiryDate = new Date(med.expiry_date)
      return expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
    }).length || 0
  const expiredCount =
    medicines?.filter((med: Medicine) => {
      if (!med.expiry_date) return false
      const expiryDate = new Date(med.expiry_date)
      return expiryDate < currentDate
    }).length || 0
  const totalValue =
    medicines?.reduce((sum: number, med: Medicine) => sum + med.stock_quantity * Number.parseFloat(med.unit_price), 0) || 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
            <p className="text-gray-600">Manage your pharmacy's medicine inventory</p>
          </div>
          
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{medicines?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Active medicines</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockCount}</div>
              <p className="text-xs text-muted-foreground">Need restocking</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringCount}</div>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalValue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Inventory value</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {(lowStockCount > 0 || expiringCount > 0 || expiredCount > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {lowStockCount > 0 && (
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-5 w-5" />
                    Low Stock Alert
                  </CardTitle>
                  <CardDescription className="text-red-600">
                    {lowStockCount} item{lowStockCount > 1 ? "s" : ""} need restocking
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {(expiringCount > 0 || expiredCount > 0) && (
              <Card className="border-orange-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-700">
                    <Clock className="h-5 w-5" />
                    Expiry Alert
                  </CardTitle>
                  <CardDescription className="text-orange-600">
                    {expiringCount} expiring soon{expiredCount > 0 && `, ${expiredCount} expired`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {expiringCount > 0 && (
                      <Badge variant="outline" className="border-orange-300 text-orange-700">
                        {expiringCount} Expiring
                      </Badge>
                    )}
                    {expiredCount > 0 && <Badge variant="destructive">{expiredCount} Expired</Badge>}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <CardTitle>Medicine Inventory</CardTitle>
            <CardDescription>View and manage all medicines with filtering and expiry tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedInventoryTable medicines={medicines || []} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
