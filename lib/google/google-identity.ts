/**
 * Google Identity Services (GIS) loader. The script is only loaded where a Google button is shown (the
 * auth dialog and the profile "Connected accounts" card), never globally. GIS hands back an ID token
 * (a JWT "credential"); the BFF forwards it to .NET, which verifies it — the browser never trusts it.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client"

export interface GoogleCredentialResponse {
  credential: string
  select_by?: string
}

export interface GoogleButtonOptions {
  type?: "standard" | "icon"
  theme?: "outline" | "filled_blue" | "filled_black"
  size?: "large" | "medium" | "small"
  text?: "signin_with" | "signup_with" | "continue_with" | "signin"
  shape?: "rectangular" | "pill" | "circle" | "square"
  logo_alignment?: "left" | "center"
  width?: number
  locale?: string
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    context?: "signin" | "signup" | "use"
    ux_mode?: "popup" | "redirect"
    itp_support?: boolean
    use_fedcm_for_prompt?: boolean
  }): void
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

/** The OAuth web client id, or null when Google sign-in isn't configured (buttons are then hidden). */
export function googleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
  return id ? id : null
}

let loading: Promise<GoogleAccountsId> | null = null

/** Loads the GIS script once and resolves with `google.accounts.id`. */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google sign-in runs in the browser only"))
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (loading) return loading

  loading = new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const script = existing ?? document.createElement("script")
    const done = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id)
      else reject(new Error("Google sign-in failed to load"))
    }
    script.addEventListener("load", done, { once: true })
    script.addEventListener(
      "error",
      () => {
        loading = null
        reject(new Error("Google sign-in failed to load. Check your connection and try again."))
      },
      { once: true },
    )
    if (!existing) {
      script.src = GIS_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
  return loading
}

/** Reads the display fields of a Google ID token for UI hints only (never for trust decisions). */
export function peekGoogleCredential(credential: string): { email?: string; name?: string; picture?: string } {
  try {
    const payload = credential.split(".")[1]
    if (!payload) return {}
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(json) as { email?: unknown; name?: unknown; picture?: unknown }
    return {
      email: typeof claims.email === "string" ? claims.email : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined,
      picture: typeof claims.picture === "string" ? claims.picture : undefined,
    }
  } catch {
    return {}
  }
}
