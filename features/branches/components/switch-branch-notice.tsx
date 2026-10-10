"use client"

import { ArrowRightLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InlineAlert } from "@/features/accounting/components/accounting-ui"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useSwitchBranch } from "@/features/branches/hooks/use-switch-branch"

/** True when `targetBranchId` is a real branch other than the one the user is working in. */
export function useIsOtherBranch(targetBranchId: string | null | undefined): boolean {
  const access = useBranchAccess()
  if (access.isLoading || !targetBranchId || !access.ownBranchId) return false
  return targetBranchId.toLowerCase() !== access.ownBranchId.toLowerCase()
}

/**
 * Writes (opening a shift, recording a deposit, importing a statement) land on the branch the user works
 * in. When the form targets another branch, this explains it and offers a one-click switch, instead of the
 * submit failing with a dead-end error.
 */
export function SwitchBranchNotice({ targetBranchId, action }: { targetBranchId: string | null | undefined; action: string }) {
  const access = useBranchAccess()
  const switchBranch = useSwitchBranch()
  const other = useIsOtherBranch(targetBranchId)
  if (!other) return null

  const target = access.branches.find((b) => b.id.toLowerCase() === targetBranchId?.toLowerCase())
  const current = access.ownBranch
  return (
    <InlineAlert tone="warning" title={`You're working in ${current?.name ?? "another branch"}`}>
      <p>
        To {action} for {target?.name ?? "this branch"}, switch to it first. It will be recorded at the branch you work in.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        loading={switchBranch.isPending}
        loadingText="Switching…"
        onClick={() => targetBranchId && switchBranch.mutate(targetBranchId)}
      >
        <ArrowRightLeft aria-hidden />
        Switch to {target?.name ?? "this branch"}
      </Button>
    </InlineAlert>
  )
}
