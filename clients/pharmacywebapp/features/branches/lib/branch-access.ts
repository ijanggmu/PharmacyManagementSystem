import type { Branch } from "@/lib/api/branches-api"

/** What the signed-in user may see across branches. */
export interface BranchAccessState {
  /** Holds Branches.ViewAll (or is root): may pick any branch or "all". */
  canViewAll: boolean
  /** The branch the API scopes this user to. Null when the tenant has no branches yet. */
  ownBranchId: string | null
}

/**
 * The branch the API resolves for this user: their saved selection when it still exists, otherwise the
 * tenant default (BranchService.GetDefaultBranchIdAsync), otherwise the first active branch.
 */
export function resolveOwnBranchId(branches: readonly Branch[], currentBranchId: string | null): string | null {
  if (currentBranchId) {
    const saved = branches.find((b) => b.id.toLowerCase() === currentBranchId.toLowerCase())
    if (saved) return saved.id
  }
  const fallback = branches.find((b) => b.isActive && b.isDefault) ?? branches.find((b) => b.isActive) ?? branches[0]
  return fallback?.id ?? null
}

export interface BranchFilterChoices {
  /** Show the "All branches" option. */
  allowAll: boolean
  /** Branches the user may pick from. */
  options: Branch[]
  /** Render the branch as a read-only value instead of a picker. */
  locked: boolean
}

/** Which branch choices a filter may offer this user. */
export function branchFilterChoices(access: BranchAccessState, branches: readonly Branch[]): BranchFilterChoices {
  if (access.canViewAll) return { allowAll: true, options: [...branches], locked: false }
  const own = branches.find((b) => b.id === access.ownBranchId)
  return { allowAll: false, options: own ? [own] : [], locked: true }
}

/**
 * The branch filter value to send. ViewAll users get their selection ("" = all branches); everyone else
 * is pinned to their own branch whatever was selected, so the UI never names another branch.
 */
export function effectiveBranchFilter(access: BranchAccessState, selected: string): string {
  return access.canViewAll ? selected : (access.ownBranchId ?? "")
}
