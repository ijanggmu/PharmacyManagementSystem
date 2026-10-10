import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 p-4 sm:p-6">
      <span className="sr-only">Loading point of sale…</span>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="hidden h-96 w-full rounded-xl lg:block" />
      </div>
    </div>
  )
}
