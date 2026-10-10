"use client"

import { useCallback, useEffect, useState } from "react"
import { Laptop, LogOut, MonitorSmartphone, Smartphone, Tablet } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { listOwnSessions, revokeOwnSession, type OwnSession } from "@/lib/api/profile-api"

function deviceIcon(type: string | null | undefined) {
  const t = (type ?? "").toLowerCase()
  if (t.includes("mobile") || t.includes("phone")) return Smartphone
  if (t.includes("tablet")) return Tablet
  if (t.includes("desktop")) return Laptop
  return MonitorSmartphone
}

function describe(session: OwnSession): string {
  const browser = session.browser && session.browser !== "Other" ? session.browser : "Browser"
  const os = session.operatingSystem && session.operatingSystem !== "Other" ? ` on ${session.operatingSystem}` : ""
  return `${browser}${os}`
}

function ago(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "—" : formatDistanceToNow(date, { addSuffix: true })
}

/** The signed-in user's own sign-in sessions (Identity /sessions/me), with per-session sign-out. */
export function SessionsCard({ canRevoke }: { canRevoke: boolean }) {
  const { toast } = useToast()
  const [sessions, setSessions] = useState<OwnSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<OwnSession | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listOwnSessions()
      setSessions(
        rows
          .filter((s) => s.isActive)
          .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
      )
    } catch (err) {
      setError(apiRequestErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const confirmRevoke = async () => {
    if (!revoking) return
    setBusy(true)
    try {
      await revokeOwnSession(revoking.id)
      toast({ title: "Signed out", description: `${describe(revoking)} was signed out.` })
      setRevoking(null)
      await load()
    } catch (err) {
      toast({ title: "Couldn't sign out that session", description: apiRequestErrorMessage(err), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  if (loading && !sessions) {
    return (
      <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading sessions">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorState message={error} onRetry={() => void load()} retrying={loading} size="compact" />
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No active sessions.</p>
  }

  return (
    <>
      <ul className="divide-y" aria-label="Active sessions">
        {sessions.map((session) => {
          const Icon = deviceIcon(session.deviceType)
          return (
            <li key={session.id} className="flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border" aria-hidden>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {describe(session)}
                  {session.isCurrentSession && <span className="ml-2 text-xs font-normal text-primary">This device</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {session.ipAddress ? `${session.ipAddress} · ` : ""}Active {ago(session.lastActivityAt)} · Signed in{" "}
                  {ago(session.createdAt)}
                </p>
              </div>
              {canRevoke && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevoking(session)}
                  aria-label={`Sign out ${describe(session)}, active ${ago(session.lastActivityAt)}`}
                >
                  <LogOut aria-hidden />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        isOpen={revoking !== null}
        onClose={() => !busy && setRevoking(null)}
        onConfirm={() => void confirmRevoke()}
        title="Sign out this session?"
        description={
          revoking
            ? `${describe(revoking)} (active ${ago(revoking.lastActivityAt)}) will need to sign in again. If this is the device you're using now, you'll be signed out here too.`
            : ""
        }
        confirmText="Sign out"
        variant="destructive"
        loading={busy}
      />
    </>
  )
}
