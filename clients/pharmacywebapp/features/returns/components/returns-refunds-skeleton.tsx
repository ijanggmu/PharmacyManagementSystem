import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"

/** Loading state for /dashboard/returns (route loading.tsx and the Suspense fallback). */
export function ReturnsRefundsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" role="status" aria-label="Loading returns and refunds">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-9 w-full rounded-md sm:w-44" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg sm:w-60" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <SkeletonTable rows={6} cols={6} />
    </div>
  )
}
