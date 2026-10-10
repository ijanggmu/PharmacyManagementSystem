"use client"

import { useCallback, useMemo, useState } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Branch } from "@/lib/api/branches-api"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import { useBranchAccess, type BranchAccess } from "@/features/branches/hooks/use-branch-access"
import { effectiveBranchFilter } from "@/features/branches/lib/branch-access"

const ALL = "__all__"

export interface BranchFilterState {
  /** The picker's value; "" = all branches (ViewAll users only). */
  value: string
  setValue: (branchId: string) => void
  /**
   * The `branchId` to send: undefined means "let the server decide" (all branches for ViewAll users,
   * the user's own branch for everyone else). Pinned users always resolve to their own branch.
   */
  branchId: string | undefined
  /** Render a picker: the user may view all branches and the pharmacy has more than one. */
  showPicker: boolean
  /** Rows can come from several branches, so a Branch column/label is worth showing. */
  showBranchColumn: boolean
  /** Human label for the current scope, e.g. "All branches" or "Lakeside". */
  scopeLabel: string
  branchName: (branchId: string | null | undefined) => string
  access: BranchAccess
}

/** Branch scope for one list or report screen, built on the user's branch access. */
export function useBranchFilter(initial = ""): BranchFilterState {
  const access = useBranchAccess()
  const [value, setValueState] = useState(initial)
  const setValue = useCallback((id: string) => setValueState(id), [])

  const multiBranch = access.branches.length > 1
  const effective = effectiveBranchFilter(access, value)
  const branchName = useBranchNameResolver(access.branches)

  return useMemo(() => {
    const showPicker = !access.isLoading && access.canViewAll && multiBranch
    return {
      value,
      setValue,
      branchId: effective || undefined,
      showPicker,
      showBranchColumn: access.canViewAll && multiBranch && !effective,
      scopeLabel: effective ? branchName(effective) : access.canViewAll ? "All branches" : branchName(access.ownBranchId),
      branchName,
      access,
    }
  }, [access, multiBranch, value, setValue, effective, branchName])
}

/** id → branch name, falling back to an em dash for missing ids and "Unknown branch" for stale ones. */
export function useBranchNameResolver(branches: readonly Branch[]) {
  return useCallback(
    (branchId: string | null | undefined) => {
      if (!branchId) return "—"
      const branch = branches.find((b) => b.id.toLowerCase() === branchId.toLowerCase())
      return branch?.name ?? "Unknown branch"
    },
    [branches],
  )
}

/** Branch names for list rows without owning a filter (e.g. a column in a table fed by another hook). */
export function useBranchNames() {
  const access = useBranchAccess()
  const branchName = useBranchNameResolver(access.branches)
  return { branchName, multiBranch: access.branches.length > 1, canViewAll: access.canViewAll }
}

/**
 * The branch picker for list/report toolbars. ViewAll users get "All branches" + each branch; users pinned
 * to one branch see it read-only (only when the pharmacy has several, so the scope is worth stating).
 */
export function BranchFilterSelect({
  filter,
  id = "branch-filter",
  label = "Branch",
  hideLabel,
  onChange,
  className,
}: {
  filter: BranchFilterState
  id?: string
  label?: string
  hideLabel?: boolean
  /** Extra side effect on change (e.g. reset paging). */
  onChange?: (branchId: string) => void
  className?: string
}) {
  const { access } = filter
  if (access.isLoading || access.branches.length <= 1) return null

  if (!filter.showPicker) {
    return (
      <div className={cn("space-y-1.5", className)}>
        {!hideLabel && <Label htmlFor={id}>{label}</Label>}
        <BranchScopeBadge id={id} branch={access.ownBranch} />
      </div>
    )
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <Select
        value={filter.value || ALL}
        onValueChange={(v) => {
          const next = v === ALL ? "" : v
          filter.setValue(next)
          onChange?.(next)
        }}
      >
        <SelectTrigger id={id} className="h-9 w-full min-w-[10rem] sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All branches</SelectItem>
          {access.branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
              {!b.isActive && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * States which branches the figures on a screen cover ("All branches" or one branch). Renders nothing for
 * single-branch pharmacies.
 */
export function BranchScopeLabel({ prefix = "Showing", className }: { prefix?: string; className?: string }) {
  const filter = useBranchFilter()
  if (filter.access.isLoading || filter.access.branches.length <= 1) return null
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground", className)}>
      {prefix}: <span className="font-medium text-foreground">{filter.scopeLabel}</span>
    </span>
  )
}
