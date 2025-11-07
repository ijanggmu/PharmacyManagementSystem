/**
 * Standardized Page Container Component
 * Provides consistent layout and spacing for all pages
 */

import { cn } from "@/lib/utils"
import { designStandards } from "@/lib/design-system/standards"

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full"
}

const maxWidthClasses = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  "2xl": "max-w-[1536px]",
  full: "max-w-full",
}

export function PageContainer({
  children,
  className,
  maxWidth = "xl",
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6",
        maxWidth !== "full" && maxWidthClasses[maxWidth],
        className
      )}
    >
      {children}
    </div>
  )
}

