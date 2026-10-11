"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { Truck } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import NewReturnForm from "@/features/returns/components/new-return-form"
import { medicinesApi } from "@/features/medicines/api-client"
import { suppliersApi } from "@/features/suppliers/api-client"
import { usersApi } from "@/features/users/api-client"
import { Skeleton } from "@/components/ui/skeleton"

type FormProps = ComponentProps<typeof NewReturnForm>

export default function NewReturnPage() {
  const [medicines, setMedicines] = useState<FormProps["medicines"]>([])
  const [suppliers, setSuppliers] = useState<FormProps["suppliers"]>([])
  const [currentUser, setCurrentUser] = useState<FormProps["currentUser"]>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const sessionRes = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!sessionRes.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      const sessionBody = await sessionRes.json()
      const userId = sessionBody?.user?.id as string | undefined
      const [medicinesResult, suppliersResult, userResult] = await Promise.all([
        medicinesApi.getMedicines({ limit: 2000, sortBy: "name", sortOrder: "asc" }),
        suppliersApi.getAllSuppliers({ sortBy: "name", sortOrder: "asc" }),
        userId ? usersApi.getUser(userId) : Promise.resolve({ data: null, error: null }),
      ])
      setMedicines(medicinesResult.data || [])
      setSuppliers((suppliersResult.data || []) as FormProps["suppliers"])
      setCurrentUser((userResult.data || null) as FormProps["currentUser"])
      setIsLoading(false)
    }
    load()
  }, [])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="New supplier return"
          description="Send expired, damaged or recalled stock back to a supplier. Stock is reduced as soon as you save."
          icon={Truck}
          backHref="/dashboard/returns"
          backLabel="Returns"
        />
        <Section spacing="lg">
          {isLoading ? (
            <div className="space-y-6" role="status" aria-label="Loading return form">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <NewReturnForm medicines={medicines} suppliers={suppliers} currentUser={currentUser} />
          )}
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
