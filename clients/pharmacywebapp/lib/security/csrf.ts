/**
 * CSRF Protection
 *
 * Double-submit token: a random token lives in an httpOnly, SameSite=strict cookie and the browser
 * echoes it back in the X-CSRF-Token header (fetched from /api/csrf/token). On top of that, every
 * state-changing BFF call must come from our own origin (Origin / Referer check).
 */

import { timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

/**
 * In production the cookie uses the `__Host-` prefix: the browser then only accepts it when it is
 * Secure, Path=/ and has no Domain, so a sibling subdomain cannot plant or overwrite it. Plain-http
 * local development can't set Secure cookies, so it keeps the unprefixed name.
 */
export function csrfCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-csrf-token" : "csrf-token"
}

const CSRF_TOKEN_BYTES = 32

/** 256-bit token from the platform CSPRNG, hex encoded. */
export function generateCSRFToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function getCSRFToken(): Promise<string> {
  const cookieStore = await cookies()
  const name = csrfCookieName()
  let token = cookieStore.get(name)?.value

  if (!token) {
    token = generateCSRFToken()
    cookieStore.set(name, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    })
  }

  return token
}

/** Constant-time string comparison (length is not secret: tokens have a fixed length). */
export function tokensMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(actual, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function validateCSRFToken(token: string): Promise<boolean> {
  const cookieStore = await cookies()
  const storedToken = cookieStore.get(csrfCookieName())?.value
  if (!storedToken || !token) return false
  return tokensMatch(storedToken, token)
}

function hostOf(value: string | null): string | null {
  if (!value || value === "null") return null
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

/** Hosts this app is served on: the request's own Host (as forwarded by the edge proxy) and NEXT_PUBLIC_APP_URL. */
function allowedHosts(headers: Pick<Headers, "get">): Set<string> {
  const hosts = new Set<string>()
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase()
  const host = headers.get("host")?.trim().toLowerCase()
  if (forwardedHost) hosts.add(forwardedHost)
  if (host) hosts.add(host)
  const appHost = hostOf(process.env.NEXT_PUBLIC_APP_URL ?? null)
  if (appHost) hosts.add(appHost)
  return hosts
}

/**
 * True when a state-changing request originates from this app. Browsers send `Origin` on every
 * cross-origin request and on same-origin fetch/POST; when it is absent we fall back to `Referer`.
 * A request carrying neither (non-browser client) is allowed here — it still needs the CSRF token,
 * which a cross-site page cannot read.
 */
export function isSameOriginRequest(headers: Pick<Headers, "get">): boolean {
  const origin = headers.get("origin")
  const source = origin ?? headers.get("referer")
  if (source === null) return true
  const sourceHost = hostOf(source)
  return sourceHost !== null && allowedHosts(headers).has(sourceHost)
}
