"use client"

import type * as React from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton"

const SIZE_CLASS = {
  md: "sm:max-w-xl",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-2xl lg:max-w-3xl",
} as const

export interface DetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Main heading, e.g. an invoice or receipt number. Also used as the accessible title while loading. */
  title: React.ReactNode
  /** Plain-text title for screen readers when `title` is not a string. */
  srTitle?: string
  description?: React.ReactNode
  /** Badges or chips shown next to the title (status, fiscal year…). */
  badges?: React.ReactNode
  /** Buttons shown under the title (Print, Edit…). The primary action belongs in `footer`. */
  headerActions?: React.ReactNode
  /** Sticky bottom bar for the primary action(s). */
  footer?: React.ReactNode
  /** Shown as "Back" when the sheet is drilled into from another record. */
  onBack?: () => void
  isLoading?: boolean
  error?: unknown
  errorMessage?: string
  onRetry?: () => void
  retrying?: boolean
  size?: keyof typeof SIZE_CLASS
  children?: React.ReactNode
}

/**
 * The standard right-side details panel (same shape as the voucher detail sheet): bordered header with
 * title, badges and secondary actions; a scrolling body with loading / error states; an optional sticky
 * footer for the primary action. Use it for every "view details" in list screens so details always open
 * from the right and the list stays in place behind them.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  srTitle,
  description,
  badges,
  headerActions,
  footer,
  onBack,
  isLoading,
  error,
  errorMessage,
  onRetry,
  retrying,
  size = "lg",
  children,
}: DetailSheetProps) {
  const accessibleTitle = srTitle ?? (typeof title === "string" ? title : "Details")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-full gap-0 p-0", SIZE_CLASS[size])}>
        <SheetHeader className="gap-1 border-b px-5 pb-4 pt-5 pr-12">
          {onBack && (
            <Button variant="ghost" size="sm" className="-ml-2 mb-1 w-fit" onClick={onBack}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          )}
          {isLoading && !title ? (
            <>
              <SheetTitle className="sr-only">{accessibleTitle}</SheetTitle>
              <Skeleton variant="text" className="h-6 w-48" />
              <Skeleton variant="text" className="w-64" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-lg tracking-tight" aria-label={srTitle}>
                  {title}
                </SheetTitle>
                {badges}
              </div>
              {description ? (
                <SheetDescription>{description}</SheetDescription>
              ) : (
                <SheetDescription className="sr-only">{accessibleTitle}</SheetDescription>
              )}
              {headerActions && <div className="mt-2 flex flex-wrap gap-2">{headerActions}</div>}
            </>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-5" aria-busy="true">
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} variant="text" className="h-9" />
                ))}
              </div>
              <SkeletonTable rows={4} cols={4} />
            </div>
          ) : error ? (
            <ErrorState
              size="compact"
              title="Couldn't load these details"
              message={errorMessage ?? (error instanceof Error ? error.message : "Something went wrong.")}
              onRetry={onRetry}
              retrying={retrying}
            />
          ) : (
            <div className="space-y-6">{children}</div>
          )}
        </div>

        {footer && !isLoading && !error && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-background px-5 py-3">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** A titled block inside a DetailSheet. */
export function DetailSection({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Label/value grid for record fields. Values that are empty render as an em dash, never blank. */
export function DetailFields({ children, columns = 2, className }: { children: React.ReactNode; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3 rounded-lg border bg-muted/30 p-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  )
}

export function DetailField({
  label,
  children,
  mono,
  className,
}: {
  label: React.ReactNode
  children?: React.ReactNode
  /** Monospace for codes and numbers (invoice no., batch no.). */
  mono?: boolean
  className?: string
}) {
  const empty = children === null || children === undefined || children === ""
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm text-foreground", mono && "font-mono tabular-nums", empty && "text-muted-foreground")}>
        {empty ? "—" : children}
      </dd>
    </div>
  )
}
