"use client"

import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Branch } from "@/lib/api/branches-api"

/**
 * Read-only stand-in for a branch picker, for users whose role is limited to their own branch.
 * Sized like a select trigger so filter rows keep their alignment.
 */
export function BranchScopeBadge({
  branch,
  id,
  className,
  reason = "Your role can only view this branch",
}: {
  branch?: Branch
  id?: string
  className?: string
  /** Why the branch is fixed here (tooltip and screen-reader text). */
  reason?: string
}) {
  return (
    <div
      id={id}
      role="status"
      title={reason}
      aria-label={`Branch: ${branch?.name ?? "your branch"}. ${reason}.`}
      className={cn(
        "inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm text-foreground",
        className,
      )}
    >
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{branch ? branch.name : "Your branch"}</span>
      {branch?.code ? <span className="shrink-0 text-xs text-muted-foreground">{branch.code}</span> : null}
    </div>
  )
}
