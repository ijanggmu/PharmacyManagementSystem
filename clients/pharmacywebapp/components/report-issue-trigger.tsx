"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { LifeBuoy } from "lucide-react"
import { ReportIssueDialog } from "@/components/report-issue-dialog"

/**
 * Small persistent "Report an issue" launcher, mounted once from the root layout
 * (app/layout.tsx) so it is reachable from anywhere in the app without touching
 * dashboard-layout.tsx.
 *
 * Hidden for anonymous visitors: ticket creation requires an authenticated reporter —
 * CreateTicketCommandHandler (backend) throws 401 when there is no signed-in user — so there's
 * nothing useful to submit until the session check below confirms one. Anonymous/pre-login
 * reporting is out of scope for now; see the report for why.
 */
export function ReportIssueTrigger() {
  const [signedIn, setSignedIn] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/dotnet/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { user?: { id?: string } } | null) => {
        if (!cancelled) setSignedIn(!!json?.user?.id)
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!signedIn) return null

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 gap-2 shadow-lg print:hidden"
        aria-label="Report an issue"
      >
        <LifeBuoy className="h-4 w-4" />
        <span className="hidden sm:inline">Report an issue</span>
      </Button>
      <ReportIssueDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
