import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import SupplierTable from "@/components/supplier-table"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/server"

async function getSuppliers() {
  const supabase = createClient()
  const { data: suppliers, error } = await supabase.from("suppliers").select("*").order("name")

  if (error) {
    console.error("Error fetching suppliers:", error)
    return []
  }

  return suppliers || []
}

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Suppliers</h1>
            <p className="text-gray-600">Manage your medicine suppliers</p>
          </div>
          <Link href="/dashboard/suppliers/add">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-lg border">
          <Suspense fallback={<div>Loading suppliers...</div>}>
            <SupplierTable suppliers={suppliers} />
          </Suspense>
        </div>
      </div>
    </DashboardLayout>
  )
}
