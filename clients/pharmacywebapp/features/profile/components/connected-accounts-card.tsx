"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link2, Link2Off, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { GoogleButton } from "@/components/auth/google-button"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { googleClientId } from "@/lib/google/google-identity"
import { connectedAccountsApi } from "@/features/profile/api-client-connected-accounts"

const connectedAccountsKey = ["profile", "connected-accounts"] as const

/** Google's "G" mark, per Google's branding guidelines (used as a static logo, not a sign-in button). */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * Connect / disconnect Google sign-in for the signed-in user. Connecting is always an explicit action
 * here (never automatic by email), after which "Sign in with Google" opens this pharmacy directly.
 */
export function ConnectedAccountsCard() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const accounts = useQuery({ queryKey: connectedAccountsKey, queryFn: connectedAccountsApi.get, staleTime: 60_000 })

  const connect = useMutation({
    mutationFn: (idToken: string) => connectedAccountsApi.connectGoogle(idToken),
    onSuccess: (login) => {
      toast({ title: "Google connected", description: `You can now sign in with ${login.displayName ?? "Google"}.` })
      void queryClient.invalidateQueries({ queryKey: connectedAccountsKey })
    },
    onError: (error) =>
      toast({ title: "Couldn't connect Google", description: apiRequestErrorMessage(error), variant: "destructive" }),
  })

  const disconnect = useMutation({
    mutationFn: () => connectedAccountsApi.disconnectGoogle(),
    onSuccess: () => {
      setConfirmDisconnect(false)
      toast({ title: "Google disconnected", description: "Sign in with your email and password from now on." })
      void queryClient.invalidateQueries({ queryKey: connectedAccountsKey })
    },
    onError: (error) =>
      toast({ title: "Couldn't disconnect Google", description: apiRequestErrorMessage(error), variant: "destructive" }),
  })

  // Hide the card entirely when Google sign-in isn't configured on either side.
  if (!googleClientId() || (accounts.data && !accounts.data.googleEnabled)) return null

  const google = accounts.data?.logins.find((l) => l.provider === "Google")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Connected accounts</CardTitle>
        <CardDescription>Sign in with Google instead of typing your password.</CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.isLoading ? (
          <div className="flex items-center gap-3" aria-busy="true">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" className="w-32" />
              <Skeleton variant="text" className="w-48" />
            </div>
          </div>
        ) : accounts.error ? (
          <ErrorState
            size="compact"
            title="Couldn't load connected accounts"
            message={apiRequestErrorMessage(accounts.error)}
            onRetry={() => void accounts.refetch()}
            retrying={accounts.isFetching}
          />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
                <GoogleMark className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  Google
                  {google ? (
                    <Badge variant="success">
                      <Link2 aria-hidden />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="muted">Not connected</Badge>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {google
                    ? (google.displayName ?? "Your Google account")
                    : "Connect once, then use “Sign in with Google” — no pharmacy code needed."}
                </p>
              </div>
            </div>

            {google ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 sm:w-auto"
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnect.isPending}
              >
                <Link2Off aria-hidden />
                Disconnect
              </Button>
            ) : (
              <div className="w-full sm:w-64">
                {connect.isPending ? (
                  <div className="flex h-11 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Connecting…
                  </div>
                ) : (
                  <GoogleButton text="continue_with" context="use" onCredential={(token) => connect.mutate(token)} />
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        isOpen={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
        variant="destructive"
        title="Disconnect Google?"
        confirmText="Disconnect"
        description={
          accounts.data?.hasPassword === false
            ? "Google is your only way to sign in. Set a password first (use “Forgot password” on the sign-in screen), then disconnect."
            : "You'll sign in with your email and password instead. If you created this pharmacy with Google and never set a password, use “Forgot password” on the sign-in screen first."
        }
      />
    </Card>
  )
}
