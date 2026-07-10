"use client"

import { useEffect, useState } from "react"
import NewRefundForm from "@/features/refunds/components/new-refund-form"
import { salesApi } from "@/features/sales/api-client"
import { usersApi } from "@/features/users/api-client"
import { LoadingState } from "@/components/ui/loading-state"

export default function NewRefundPage() {
  const [sales, setSales] = useState<any[]>([])
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
      const [salesResult, userResult] = await Promise.all([
        salesApi.getSales({ paymentStatus: "paid", limit: 200 } as any),
        userId ? usersApi.getUser(userId) : Promise.resolve({ data: null, error: null }),
      ])
      setSales(salesResult.data || [])
      setCurrentUser(userResult.data || null)
      setIsLoading(false)
    }
    load()
  }, [])

  if (isLoading) return <LoadingState size="lg" text="Loading refund form..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Process New Refund</h1>
        <p className="text-gray-600">Create a refund for a customer return</p>
      </div>

      <NewRefundForm sales={sales} currentUser={currentUser} />
    </div>
  )
}
