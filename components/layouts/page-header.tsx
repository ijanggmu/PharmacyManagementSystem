/**
 * Standardized Page Header Component
 * Provides consistent header styling for all pages
 */

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6 space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-1">{title}</h1>
          {description && (
            <p className="mt-2 text-body-small text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

