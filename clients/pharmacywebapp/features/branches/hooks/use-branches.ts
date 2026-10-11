"use client"

import { useQuery } from "@tanstack/react-query"
import { listBranches, type Branch } from "@/lib/api/branches-api"

export const branchesQueryKey = ["branches", "list"] as const

/** The tenant's branches, active first then by name. Shared cache for pickers across the app. */
export function useBranches() {
  return useQuery({
    queryKey: branchesQueryKey,
    queryFn: async (): Promise<Branch[]> =>
      (await listBranches()).sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
      ),
    staleTime: 5 * 60 * 1000,
  })
}

/** Display label for a user's branch id; a null id means the tenant default. */
export function branchLabel(branches: readonly Branch[], branchId: string | null | undefined): string {
  const branch = branchId ? branches.find((b) => b.id === branchId) : branches.find((b) => b.isDefault)
  if (!branch) return branchId ? "Unknown branch" : "Default branch"
  return branchId ? branch.name : `${branch.name} (default)`
}
