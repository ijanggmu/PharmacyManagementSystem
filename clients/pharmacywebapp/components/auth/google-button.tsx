"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { googleClientId, loadGoogleIdentity, type GoogleButtonOptions } from "@/lib/google/google-identity"

interface GoogleButtonProps {
  /** Button wording, per Google's branding guidelines. */
  text?: NonNullable<GoogleButtonOptions["text"]>
  context?: "signin" | "signup" | "use"
  /** Receives the Google ID token. */
  onCredential: (idToken: string) => void
  /** Shows a spinner overlay and blocks clicks while the app is processing a credential. */
  busy?: boolean
  className?: string
}

/**
 * Google's own rendered "Sign in with Google" button (Google Identity Services), which keeps the official
 * branding, sizing and accessibility. Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset.
 */
export function GoogleButton({ text = "continue_with", context = "signin", onCredential, busy, className }: GoogleButtonProps) {
  const clientId = googleClientId()
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [width, setWidth] = useState(0)

  callbackRef.current = onCredential

  // GIS needs a fixed pixel width; match the container so it lines up with the form's full-width buttons.
  useEffect(() => {
    const el = containerRef.current?.parentElement
    if (!el) return
    const update = () => setWidth(Math.max(200, Math.min(400, Math.floor(el.getBoundingClientRect().width))))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!clientId || !width) return
    let cancelled = false
    loadGoogleIdentity()
      .then((gis) => {
        if (cancelled || !containerRef.current) return
        gis.initialize({
          client_id: clientId,
          callback: (response) => callbackRef.current(response.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
          context,
          ux_mode: "popup",
          itp_support: true,
        })
        containerRef.current.innerHTML = ""
        gis.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "left",
          width,
        })
        setState("ready")
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [clientId, context, text, width])

  if (!clientId) return null

  return (
    <div className={cn("relative flex min-h-11 w-full justify-center", className)} aria-busy={busy || state === "loading"}>
      <div ref={containerRef} className={cn("flex w-full justify-center", (busy || state !== "ready") && "pointer-events-none")} />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md border border-border bg-background text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          Loading Google sign-in…
        </div>
      )}
      {state === "error" && (
        <p role="alert" className="text-center text-sm text-muted-foreground">
          Google sign-in couldn&apos;t load. Use your email and password instead.
        </p>
      )}
      {busy && state === "ready" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70">
          <Loader2 className="size-5 animate-spin text-primary" aria-label="Signing in with Google" />
        </div>
      )}
    </div>
  )
}

/** "or" divider between the Google button and the email form; hidden with the button when Google isn't configured. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  if (!googleClientId()) return null
  return (
    <div className="relative my-1 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
