/**
 * Sign-in and sign-out, switchable per backend target (AUTH).
 * The legacy path stays in the components (Supabase). The dotnet path goes through the BFF at
 * /api/dotnet/auth/*, which sets httpOnly token cookies, so no bearer token reaches browser JS.
 */

import { getCSRFToken } from "@/lib/api/client-helpers"
import { DOTNET_PROXY_BASE, dotnetClient } from "@/lib/api/dotnet-client"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"

export interface DotnetSignInInput {
  email: string
  password: string
  twoFactorCode?: string
}

export type DotnetSignInResult = { ok: true } | { ok: false; code: string; message: string }

/** Turns a failed BFF login response into a code and message. The BFF returns a normalized body, and .NET returns ProblemDetails. */
export function toDotnetSignInError(status: number, body: unknown): { code: string; message: string } {
  const normalized = (body ?? {}) as { code?: unknown; message?: unknown }
  if (typeof normalized.message === "string" && typeof normalized.code === "string") {
    return { code: normalized.code, message: normalized.message }
  }
  const mapped = problemToNormalizedError(status, body)
  return { code: mapped.code, message: mapped.message }
}

export async function signInWithDotnet(
  input: DotnetSignInInput,
  fetchImpl: typeof fetch = fetch,
): Promise<DotnetSignInResult> {
  const csrf = await getCSRFToken()
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      twoFactorCode: input.twoFactorCode ?? null,
    }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => null)
  return { ok: false, ...toDotnetSignInError(res.status, body) }
}

const USERNAME_MAX = 50
const USERNAME_SUFFIX_LENGTH = 4

/**
 * Identity caps userName at 50 characters, so a long email cannot be used as-is. Build a valid,
 * unique-enough username from the local part with a random suffix to avoid collisions.
 */
export function usernameFromEmail(email: string, random: () => string = randomSuffix): string {
  const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? ""
  const base = (local.length >= 3 ? local : `user${local}`).slice(0, USERNAME_MAX - USERNAME_SUFFIX_LENGTH - 1)
  return `${base}-${random()}`
}

function randomSuffix(): string {
  const bytes = new Uint8Array(USERNAME_SUFFIX_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("")
}

export interface DotnetSignUpInput {
  firstName: string
  lastName: string
  email: string
  userName: string
  password: string
  phoneNumber?: string
}

export type DotnetSignUpResult = { ok: true; userId: string } | { ok: false; code: string; message: string }

/**
 * Self-registration through the BFF at /api/dotnet/auth/register. The account is created with
 * EmailConfirmed=false, so the user must confirm their email before the first sign-in.
 * No session cookies are set here.
 */
export async function signUpWithDotnet(
  input: DotnetSignUpInput,
  fetchImpl: typeof fetch = fetch,
): Promise<DotnetSignUpResult> {
  const csrf = await getCSRFToken()
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      userName: input.userName,
      password: input.password,
      phoneNumber: input.phoneNumber ?? null,
    }),
  })
  const body = await res.json().catch(() => null)
  if (res.ok) {
    const userId = (body as { userId?: unknown } | null)?.userId
    return typeof userId === "string" ? { ok: true, userId } : { ok: false, code: "INTERNAL", message: "Unexpected response from server" }
  }
  return { ok: false, ...toDotnetSignInError(res.status, body) }
}

export async function signOutWithDotnet(fetchImpl: typeof fetch = fetch): Promise<void> {
  const csrf = await getCSRFToken()
  await fetchImpl(`${DOTNET_PROXY_BASE}/auth/logout`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrf },
    credentials: "same-origin",
  })
}

/** Subset of the .NET UserDto returned by GET /api/v1/identity/profile. */
export interface DotnetProfileDto {
  id?: string | null
  userName?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export interface DashboardUserInfo {
  name: string
  role: string
  rawRole: string
  initials: string
}

/** Maps the .NET profile and session role onto the fields the dashboard layout displays. Pure. */
export function dashboardUserInfoFromDotnet(profile: DotnetProfileDto, role: string | null): DashboardUserInfo {
  const fullName = [profile.firstName, profile.lastName].map((part) => part?.trim() ?? "").filter(Boolean).join(" ")
  const name = fullName || profile.userName?.trim() || profile.email?.trim() || "User"
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  const rawRole = role ?? ""
  return { name, role: rawRole, rawRole, initials }
}

/**
 * Loads the signed-in user's id and display fields. The name comes from the .NET profile endpoint
 * (through the BFF proxy). The role comes from the BFF session route, because UserDto carries no role.
 * Returns null on any failure so the layout keeps its empty state.
 */
export async function loadDotnetCurrentUser(
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; info: DashboardUserInfo } | null> {
  try {
    const [profile, session] = await Promise.all([
      dotnetClient.get<DotnetProfileDto>("/identity/profile"),
      fetchImpl(`${DOTNET_PROXY_BASE}/auth/session`, { credentials: "same-origin" }).then((res) =>
        res.ok ? (res.json() as Promise<{ user?: { role?: string | null } }>) : null,
      ),
    ])
    if (!profile?.id) return null
    return { id: profile.id, info: dashboardUserInfoFromDotnet(profile, session?.user?.role ?? null) }
  } catch {
    return null
  }
}
