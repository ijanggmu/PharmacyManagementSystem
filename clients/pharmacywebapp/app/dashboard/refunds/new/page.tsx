"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { RefreshCw } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import NewRefundForm from "@/features/refunds/components/new-refund-form"
import { salesApi } from "@/features/sales/api-client"
import { usersApi } from "@/features/users/api-client"
import { Skeleton } from "@/components/ui/skeleton"

type FormProps = ComponentProps<typeof NewRefundForm>

export default function NewRefundPage() {
  const [sales, setSales] = useState<FormProps["sales"]>([])
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
      const [salesResult, userResult] = await Promise.all([
        salesApi.getSales({ paymentStatus: "paid", limit: 200 }),
        userId ? usersApi.getUser(userId) : Promise.resolve({ data: null, error: null }),
      ])
      setSales((salesResult.data || []) as unknown as FormProps["sales"])
      setCurrentUser(userResult.data || null)
      setIsLoading(false)
    }
    load()
  }, [])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="New refund"
          description="Give a customer money back for items on a paid sale. New refunds start as pending until approved."
          icon={RefreshCw}
          backHref="/dashboard/returns?view=refunds"
          backLabel="Refunds"
        />
        <Section spacing="lg">
          {isLoading ? (
            <div className="space-y-6" role="status" aria-label="Loading refund form">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : (
            <NewRefundForm sales={sales} currentUser={currentUser} />
          )}
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
