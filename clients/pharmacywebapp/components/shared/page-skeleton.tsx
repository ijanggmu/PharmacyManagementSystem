import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"

/**
 * Generic page placeholder — header, KPI row, toolbar and table — shown instantly inside the
 * persistent shell while a route's data loads. Matches PageHeader/StatGrid spacing so the
 * real content lands without a layout jump.
 */
export function PageSkeleton({ label = "Loading page", stats = 4 }: { label?: string; stats?: number }) {
  return (
    <div className="space-y-8" role="status" aria-label={label}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <Skeleton className="hidden size-10 rounded-lg sm:block" />
          <div className="space-y-2.5 pt-0.5">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-72 max-w-[60vw]" />
          </div>
        </div>
        <Skeleton className="hidden h-9 w-28 rounded-md sm:block" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}
      <div className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="mb-5 flex gap-3">
          <Skeleton className="h-9 flex-1 rounded-md sm:max-w-xs" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <SkeletonTable rows={7} cols={5} />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  )
}
