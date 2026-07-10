"use client"

import { useEffect, useState } from "react"
import NewReturnForm from "@/features/returns/components/new-return-form"
import { medicinesApi } from "@/features/medicines/api-client"
import { suppliersApi } from "@/features/suppliers/api-client"
import { usersApi } from "@/features/users/api-client"
import { LoadingState } from "@/components/ui/loading-state"

export default function NewReturnPage() {
  const [medicines, setMedicines] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" })
      if (!sessionRes.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      const sessionBody = await sessionRes.json()
      const userId = sessionBody?.data?.user?.id as string | undefined
      const [medicinesResult, suppliersResult, userResult] = await Promise.all([
        medicinesApi.getMedicines({ limit: 2000, sortBy: "name", sortOrder: "asc" }),
        suppliersApi.getSuppliers({ limit: 2000, sortBy: "name", sortOrder: "asc" } as any),
        userId ? usersApi.getUser(userId) : Promise.resolve({ data: null, error: null }),
      ])
      setMedicines(medicinesResult.data || [])
      setSuppliers(suppliersResult.data || [])
      setCurrentUser(userResult.data || null)
      setIsLoading(false)
    }
    load()
  }, [])

  if (isLoading) return <LoadingState size="lg" text="Loading return form..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Medicine Return</h1>
        <p className="text-gray-600">Process a return to supplier for expired or defective medicines</p>
      </div>

      <NewReturnForm medicines={medicines} suppliers={suppliers} currentUser={currentUser} />
    </div>
  )
}
