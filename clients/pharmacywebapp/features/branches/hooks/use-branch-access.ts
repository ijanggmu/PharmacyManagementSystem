"use client"

import { useQuery } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { getBranchContext, type Branch } from "@/lib/api/branches-api"
import { canViewAllBranches } from "@/lib/api/dotnet-permissions"
import { resolveOwnBranchId, type BranchAccessState } from "@/features/branches/lib/branch-access"

export const branchContextQueryKey = ["branches", "context"] as const
export const currentUserQueryKey = ["auth", "current-user"] as const

export interface BranchAccess extends BranchAccessState {
  ownBranch?: Branch
  /** The caller's saved branch selection, if any. */
  currentBranchId: string | null
  /** The tenant's branches (from /branches/context). */
  branches: Branch[]
  /** True until both the permissions and the branch context are known. Don't render pickers before. */
  isLoading: boolean
}

/** Which branches the signed-in user may see, and the branch the API scopes them to. */
export function useBranchAccess(): BranchAccess {
  const user = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  const context = useQuery({
    queryKey: branchContextQueryKey,
    queryFn: () => getBranchContext(),
    staleTime: 5 * 60 * 1000,
  })

  const branches = context.data?.branches ?? []
  const ownBranchId = resolveOwnBranchId(branches, context.data?.currentBranchId ?? null)
  return {
    canViewAll: canViewAllBranches(user.data?.info.permissions ?? []),
    ownBranchId,
    ownBranch: branches.find((b) => b.id === ownBranchId),
    currentBranchId: context.data?.currentBranchId ?? null,
    branches,
    isLoading: user.isLoading || context.isLoading,
  }
}
