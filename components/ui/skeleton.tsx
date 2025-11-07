/**
 * Standardized Skeleton Loader Component
 * Provides consistent skeleton loading states
 */

import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
  variant?: "text" | "circular" | "rectangular"
}

export function Skeleton({ className, variant = "rectangular" }: SkeletonProps) {
  const variantClasses = {
    text: "h-4 rounded",
    circular: "h-12 w-12 rounded-full",
    rectangular: "h-24 rounded-md",
  }

  return (
    <div
      className={cn(
        "animate-pulse bg-muted",
        variantClasses[variant],
        className
      )}
    />
  )
}

// Pre-built skeleton components for common use cases
export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={cn(i === lines - 1 && "w-3/4")}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-lg border p-6", className)}>
      <Skeleton variant="text" className="h-6 w-1/2" />
      <SkeletonText lines={3} />
      <Skeleton variant="rectangular" className="h-32" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} variant="text" className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

