/**
 * Standardized Loading State Component
 * Prefer skeletons (components/ui/skeleton) for content that has a known shape;
 * use this for short, shape-less waits.
 */

import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { BrandLoader } from "@/components/brand/brand-loader"

interface LoadingStateProps {
  size?: "sm" | "md" | "lg"
  className?: string
  text?: string
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
}

export function LoadingState({
  size = "md",
  className,
  text,
}: LoadingStateProps) {
  // Page-level waits get the branded loader; inline waits keep a quiet spinner.
  if (size === "lg") return <BrandLoader label={text ?? "Loading"} className={className} />

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        className
      )}
    >
      <Loader2 className={cn("animate-spin text-primary", sizeClasses[size])} aria-hidden />
      <p className={cn("text-sm text-muted-foreground", !text && "sr-only")}>{text ?? "Loading…"}</p>
    </div>
  )
}
