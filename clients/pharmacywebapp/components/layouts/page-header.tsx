/**
 * Standardized Page Header Component
 * One per page: orientation (breadcrumbs/back), the page's h1, a one-line purpose,
 * and the page's actions — primary action last so it sits at the right edge.
 */

import Link from "next/link"
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Small icon tile beside the title — use the same icon as the sidebar entry. */
  icon?: LucideIcon
  /** Trail above the title for pages 2+ levels deep. Last item is the current page. */
  breadcrumbs?: Breadcrumb[]
  /** Renders a "← label" link above the title (for create/detail pages). */
  backHref?: string
  backLabel?: string
  /** Inline status next to the title, e.g. a Badge. */
  badge?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  breadcrumbs,
  backHref,
  backLabel = "Back",
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={cn(last && "text-foreground")}>
                      {crumb.label}
                    </span>
                  )}
                  {!last && <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />}
                </li>
              )
            })}
          </ol>
        </nav>
      )}

      {backHref && !breadcrumbs && (
        <Link
          href={backHref}
          className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon && (
            <div
              className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-xs ring-1 ring-border sm:flex"
              aria-hidden
            >
              <Icon className="size-[18px]" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-heading-1 text-foreground">{title}</h1>
              {badge}
            </div>
            {description && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>
    </header>
  )
}
