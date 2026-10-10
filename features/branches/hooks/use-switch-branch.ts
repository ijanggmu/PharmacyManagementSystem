"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { branchErrorMessage, switchBranch, type BranchContext } from "@/lib/api/branches-api"
import { branchContextQueryKey } from "@/features/branches/hooks/use-branch-access"

/**
 * Switches the caller's current branch (POST /branches/switch). On success the new context is put in the
 * cache and every other query is invalidated, because nearly all lists and reports default to the current
 * branch; the router is refreshed so server-rendered pages re-read too.
 */
export function useSwitchBranch(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (branchId: string) => switchBranch(branchId),
    onSuccess: (context: BranchContext) => {
      queryClient.setQueryData(branchContextQueryKey, context)
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== branchContextQueryKey[0] || query.queryKey[1] !== branchContextQueryKey[1],
      })
      router.refresh()
      if (!options.silent) {
        const branch = context.branches.find((b) => b.id === context.currentBranchId)
        toast({ title: "Branch switched", description: branch ? `You're now working in ${branch.name}.` : undefined })
      }
    },
    onError: (error) => {
      toast({ title: "Couldn't switch branch", description: branchErrorMessage(error), variant: "destructive" })
    },
  })
}
