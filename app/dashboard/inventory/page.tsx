"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
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
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"

export default function InventoryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [medicines, setMedicines] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [shouldOpenCreateModal, setShouldOpenCreateModal] = useState(false)

  const fetchMedicines = async () => {
    const supabase = createClient()
    const { data: medicinesData, error } = await supabase
      .from("medicines")
      .select(`
        *,
        categories (id, name),
        suppliers (id, name)
      `)
      .order("name")

    if (error) {
      console.error("Error fetching medicines:", error)
      throw new Error("Failed to load inventory data. Please try again later.")
    }

    setMedicines(medicinesData || [])
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
      
      // Fetch medicines data
      await fetchMedicines()
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
      router.replace("/dashboard/inventory", { scroll: false })
    }
  }, [searchParams, router])

  // Listen for refresh events
  useEffect(() => {
    const handleRefresh = () => {
      fetchMedicines()
    }

    window.addEventListener('refresh-medicines', handleRefresh)
    return () => {
      window.removeEventListener('refresh-medicines', handleRefresh)
    }
  }, [])

  const handleMedicineDeleted = (medicineId: string) => {
    setMedicines(prevMedicines => prevMedicines.filter(medicine => medicine.id !== medicineId))
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading inventory..." />
        </PageContainer>
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
      <PageContainer>
        <PageHeader
          title="Inventory Management"
          description="Manage your pharmacy's medicine inventory"
        />

        <Section spacing="lg">
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
        </Section>

        {/* Alerts */}
        {(lowStockCount > 0 || expiringCount > 0 || expiredCount > 0) && (
          <Section spacing="lg">
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
          </Section>
        )}

        <Section spacing="lg">
          {/* Inventory Table */}
          <Card>
          <CardHeader>
            <CardTitle>Medicine Inventory</CardTitle>
            <CardDescription>View and manage all medicines with filtering and expiry tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <EnhancedInventoryTable openCreateModal={shouldOpenCreateModal} onCreateModalClose={() => setShouldOpenCreateModal(false)} />
          </CardContent>
        </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
