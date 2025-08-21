"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedInventoryTable from "@/components/enhanced-inventory-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, AlertTriangle, Clock, Package, DollarSign } from "lucide-react"
import Link from "next/link"
import { CurrencyDisplay } from "@/components/currency-display"
import ExpiredTable from "@/components/expired-table"

export default function InventoryPage() {
  const [user, setUser] = useState<any>(null)
  const [medicines, setMedicines] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = "/auth/login"
        return
      }
      setUser(user)
      
      // Fetch medicines data
      const { data: medicinesData, error } = await supabase
        .from("medicines")
        .select(`
          *,
          categories (name),
          suppliers (name)
        `)
        .order("name")

      if (error) {
        console.error("Error fetching medicines:", error)
        throw new Error("Failed to load inventory data. Please try again later.")
      }

      setMedicines(medicinesData || [])
      setIsLoading(false)
    }
    checkUser()
  }, [])

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading inventory...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const currentDate = new Date()
  const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

  const lowStockCount = medicines?.filter((med: any) => med.stock_quantity <= med.minimum_stock).length || 0
  const expiringCount =
    medicines?.filter((med: any) => {
      if (!med.expiry_date) return false
      const expiryDate = new Date(med.expiry_date)
      return expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
    }).length || 0
  const expiredCount =
    medicines?.filter((med: any) => {
      if (!med.expiry_date) return false
      const expiryDate = new Date(med.expiry_date)
      return expiryDate < currentDate
    }).length || 0
  const totalValue =
    medicines?.reduce((sum: number, med: any) => sum + med.stock_quantity * Number.parseFloat(med.unit_price), 0) || 0

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
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'reset' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{medicines?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Active medicines</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer hover:shadow-md transition-shadow ${lowStockCount > 0 ? 'border-red-200 hover:border-red-300' : ''}`}
            onClick={() => {
              // This will be handled by the inventory table component
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'low-stock' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockCount}</div>
              <p className="text-xs text-muted-foreground">Need restocking</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer hover:shadow-md transition-shadow ${expiringCount > 0 ? 'border-orange-200 hover:border-orange-300' : ''}`}
            onClick={() => {
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'expiring-soon' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringCount}</div>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer hover:shadow-md transition-shadow ${expiredCount > 0 ? 'border-red-200 hover:border-red-300' : ''}`}
            onClick={() => {
              const event = new CustomEvent('inventory-filter', { detail: { filter: 'expired' } })
              window.dispatchEvent(event)
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiredCount}</div>
              <p className="text-xs text-muted-foreground">Expired medicines</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {(lowStockCount > 0 || expiringCount > 0 || expiredCount > 0) && (
          <div className="space-y-6">
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
            </div>
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
