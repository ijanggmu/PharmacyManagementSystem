import { Suspense } from "react"
import type { Metadata } from "next"
import DashboardLayout from "@/components/dashboard-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { NewCustomerReturnView } from "@/features/returns/components/new-customer-return-view"

export const metadata: Metadata = { title: "New customer return" }

export default function NewCustomerReturnPage() {
  return (
    <DashboardLayout>
      {/* useSearchParams in the view needs a Suspense boundary to prerender. */}
      <Suspense fallback={<Skeleton className="m-6 h-64 rounded-xl" />}>
        <NewCustomerReturnView />
      </Suspense>
    </DashboardLayout>
  )
}
