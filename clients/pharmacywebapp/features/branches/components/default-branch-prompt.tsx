"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Building2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBranches } from "@/features/branches/hooks/use-branches"
import type { Branch } from "@/lib/api/branches-api"

/** Name and code the backend gives the branch it creates automatically for every new tenant. */
export const AUTO_BRANCH_NAME = "Main Branch"
export const AUTO_BRANCH_CODE = "MAIN"

const DISMISS_KEY = "default-branch-prompt-dismissed"

export function isUntouchedAutoBranch(branch: Branch): boolean {
  return branch.code === AUTO_BRANCH_CODE && branch.name === AUTO_BRANCH_NAME && !branch.address && !branch.phone
}

/**
 * Invites an admin to rename the "Main Branch" the system created at signup and fill in its address,
 * which prints on receipts. Hidden once the branch is edited or the prompt is dismissed.
 */
export function DefaultBranchPrompt({ canManage, showManageLink = true }: { canManage: boolean; showManageLink?: boolean }) {
  const { data: branches } = useBranches()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  const autoBranch = branches?.find(isUntouchedAutoBranch)
  if (!canManage || dismissed || !autoBranch) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Storage unavailable: the prompt just comes back next visit.
    }
  }

  return (
    <div
      role="region"
      aria-label="Set up your branch"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Name your branch</p>
        <p className="text-sm text-muted-foreground">
          We created <span className="font-medium text-foreground">{AUTO_BRANCH_NAME}</span> so you can start selling
          right away. Rename it and add its address and phone, which appear on receipts. Add more branches if you have
          other outlets.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {showManageLink ? (
          <Button asChild size="sm">
            <Link href="/dashboard/branches">Set up branch</Link>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss branch setup reminder">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
