/**
 * Standardized Section Component
 * Provides consistent section spacing and layout
 */

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface SectionProps {
  children: ReactNode
  title?: string
  description?: string
  className?: string
  spacing?: "sm" | "md" | "lg"
}

const spacingClasses = {
  sm: "mb-4",
  md: "mb-6",
  lg: "mb-10",
}

export function Section({
  children,
  title,
  description,
  className,
  spacing = "md",
}: SectionProps) {
  return (
    <section className={cn(spacingClasses[spacing], className)}>
      {(title || description) && (
        <div className="mb-4 space-y-1">
          {title && <h2 className="text-heading-3">{title}</h2>}
          {description && (
            <p className="text-body-small text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

