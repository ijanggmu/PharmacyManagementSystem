import { Suspense } from "react"
import type { Metadata } from "next"
import DashboardLayout from "@/components/dashboard-layout"
import { ReturnsRefundsView } from "@/features/returns/components/returns-refunds-view"
import { ReturnsRefundsSkeleton } from "@/features/returns/components/returns-refunds-skeleton"

export const metadata: Metadata = { title: "Returns & refunds" }

/**
 * Returns & refunds — one page, two tabs (?view=returns|refunds).
 * /dashboard/refunds redirects here with view=refunds.
 */
export default function ReturnsPage() {
  return (
    <DashboardLayout>
      {/* useSearchParams in the view needs a Suspense boundary to prerender. */}
      <Suspense fallback={<ReturnsRefundsSkeleton />}>
        <ReturnsRefundsView />
      </Suspense>
    </DashboardLayout>
  )
}
