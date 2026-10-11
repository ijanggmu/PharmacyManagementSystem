"use client"

import { useEffect, useState } from "react"
import { Truck } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import NewReturnForm from "@/features/returns/components/new-return-form"
import { useCurrentUserProfile } from "@/features/returns/hooks/use-current-user-profile"
import { Skeleton } from "@/components/ui/skeleton"

export default function NewReturnPage() {
  const [isReady, setIsReady] = useState(false)
  const currentUser = useCurrentUserProfile(isReady)

  useEffect(() => {
    const check = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsReady(true)
    }
    void check()
  }, [])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="New supplier return"
          description="Posts a numbered debit note: stock goes down and the supplier's payable drops by cost plus VAT."
          icon={Truck}
          backHref="/dashboard/returns?tab=supplier"
          backLabel="Returns"
        />
        <Section spacing="lg">
          {isReady ? (
            <NewReturnForm currentUser={currentUser} />
          ) : (
            <div className="space-y-6" role="status" aria-label="Loading return form">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          )}
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
