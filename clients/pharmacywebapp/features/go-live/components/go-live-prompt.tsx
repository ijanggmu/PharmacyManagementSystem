"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Rocket, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useOpeningBalancePermissions, useOpeningBalanceState } from "@/features/accounting/hooks/use-opening-balances"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"

const DISMISS_KEY = "go-live-prompt-dismissed"

/** Invites the owner to the go-live setup until the branch's opening balances are set (or the prompt is dismissed). */
export function GoLivePrompt() {
  const permissions = useOpeningBalancePermissions()
  const access = useBranchAccess()
  const branchId = permissions.canManage ? (access.currentBranchId ?? access.ownBranchId) : null
  const opening = useOpeningBalanceState(branchId)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  if (!permissions.canManage || dismissed || !opening.data || opening.data.isSet) return null

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
      aria-label="Finish your go-live setup"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Rocket className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Finish your go-live setup</p>
        <p className="text-sm text-muted-foreground">
          Bring in your stock, suppliers, customers, cash and bank from one Excel file, all on your go-live date.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard/settings/go-live">Start go-live setup</Link>
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss go-live reminder">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
