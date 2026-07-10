"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import EnhancedNewSaleForm from "@/features/sales/components/enhanced-new-sale-form"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { customersApi } from "@/features/customers/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { LoadingState } from "@/components/ui/loading-state"

export default function NewSalePage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [medicines, setMedicines] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" })
      if (!sessionRes.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      const sessionBody = await sessionRes.json()
      setCurrentUser(sessionBody?.data?.user ?? null)

      const [customersResult, medicinesResult, prescriptionsResult] = await Promise.all([
        customersApi.getCustomers({ limit: 2000, sortBy: "first_name", sortOrder: "asc" } as any),
        medicinesApi.getMedicines({ limit: 2000, sortBy: "name", sortOrder: "asc" }),
        prescriptionsApi.getPrescriptions({
          // Include partially_filled so a prescription with remaining unDispensed
          // items can still be selected for a follow-up sale, not just brand-new ones.
          statuses: ["pending", "partially_filled"],
          limit: 2000,
          sortBy: "created_at",
          sortOrder: "desc",
        }),
      ])
      setCustomers(customersResult.data || [])
      setMedicines((medicinesResult.data || []).filter((m: any) => m.stock_quantity > 0))
      setPrescriptions(prescriptionsResult.data || [])
      setIsLoading(false)
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading POS..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Point of Sale"
          description="Process sales transactions with advanced features"
          actions={
            <Button variant="outline" size="icon" asChild>
              <Link href="/dashboard/sales">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          }
        />

        <Section spacing="lg">
          <EnhancedNewSaleForm
            customers={customers}
            medicines={medicines}
            prescriptions={prescriptions}
            currentUser={currentUser}
          />
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
