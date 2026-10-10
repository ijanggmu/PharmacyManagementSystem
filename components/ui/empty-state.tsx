/**
 * Standardized Empty State Component
 * Tells the user what this space is for and gives them the next step —
 * never just "No data".
 */

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "./button"

interface EmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
  icon?: LucideIcon
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  /** `compact` for empty tables/cards; `default` for whole-page empties. */
  size?: "default" | "compact"
  className?: string
  children?: ReactNode
}

function ActionButton({ action, variant }: { action: EmptyStateAction; variant: "default" | "outline" }) {
  const Icon = action.icon
  const content = (
    <>
      {Icon && <Icon aria-hidden />}
      {action.label}
    </>
  )
  if (action.href) {
    return (
      <Button asChild variant={variant}>
        <Link href={action.href}>{content}</Link>
      </Button>
    )
  }
  return (
    <Button variant={variant} onClick={action.onClick}>
      {content}
    </Button>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "default",
  className,
  children,
}: EmptyStateProps) {
  const compact = size === "compact"
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-2xl bg-primary/8 text-primary ring-1 ring-primary/15",
            compact ? "h-11 w-11" : "h-14 w-14"
          )}
          aria-hidden
        >
          <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
      )}
      <h3 className={cn("font-display font-semibold text-foreground", compact ? "text-base" : "text-lg")}>
        {title}
      </h3>
      {description && (
        <p className={cn("mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground")}>{description}</p>
      )}
      {children}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton action={action} variant="default" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  )
}
