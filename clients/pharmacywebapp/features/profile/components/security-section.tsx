"use client"

import { useState } from "react"
import { KeyRound, MonitorSmartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import { ChangePasswordDialog } from "./change-password-dialog"
import { SessionsCard } from "./sessions-card"
import { TwoFactorCard } from "./two-factor-card"

interface SecuritySectionProps {
  twoFactorEnabled: boolean
  canViewSessions: boolean
  canRevokeSessions: boolean
}

export function SecuritySection({ twoFactorEnabled, canViewSessions, canRevokeSessions }: SecuritySectionProps) {
  const [passwordOpen, setPasswordOpen] = useState(false)
  const { openForgotPassword } = useAuthDialog()

  return (
    <section aria-labelledby="security-heading" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle id="security-heading" className="font-display text-base">
            Sign-in &amp; security
          </CardTitle>
          <CardDescription>Keep your account safe — especially on shared counter computers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 px-6 pb-6">
          <div className="divide-y rounded-lg border">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15" aria-hidden>
                  <KeyRound className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="font-medium text-foreground">Password</p>
                  <p className="text-sm text-muted-foreground">
                    Change it here with your current password.{" "}
                    <button
                      type="button"
                      onClick={() => openForgotPassword()}
                      className="cursor-pointer rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Forgot it?
                    </button>
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPasswordOpen(true)}>
                Change password
              </Button>
            </div>
            <TwoFactorCard enabled={twoFactorEnabled} />
          </div>
        </CardContent>
      </Card>

      {canViewSessions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <MonitorSmartphone className="h-4 w-4 text-muted-foreground" aria-hidden />
              Where you&apos;re signed in
            </CardTitle>
            <CardDescription>Sign out any device you don&apos;t recognise or no longer use.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 px-6 pb-6">
            <div className="rounded-lg border">
              <SessionsCard canRevoke={canRevokeSessions} />
            </div>
          </CardContent>
        </Card>
      )}

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </section>
  )
}
