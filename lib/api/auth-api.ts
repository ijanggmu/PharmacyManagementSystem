/**
 * Sign-in and sign-out through the BFF at /api/dotnet/auth/*, which sets httpOnly token cookies,
 * so no bearer token reaches browser JS.
 */

import { getCSRFToken } from "@/lib/api/client-helpers"
import { DOTNET_PROXY_BASE, dotnetClient } from "@/lib/api/dotnet-client"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"

export interface DotnetSignInInput {
  email: string
  password: string
  twoFactorCode?: string
  /** One-time 2FA recovery code, sent instead of twoFactorCode when the authenticator is unavailable. */
  recoveryCode?: string
  /** Pharmacy code (tenant slug). Blank falls back to the host name on the server. */
  tenant?: string
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
      tenant: input.tenant ?? null,
      ...(input.recoveryCode ? { recoveryCode: input.recoveryCode } : {}),
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

/**
 * Requests a password reset email through the BFF at /api/dotnet/auth/forgot-password. Always
 * resolves `ok: true` — the BFF deliberately answers the same way regardless of whether the email
 * exists, matching the .NET endpoint's own anti-enumeration behavior, so callers should show a
 * generic "if that email exists…" message rather than branching on the result.
 */
export async function forgotPasswordWithDotnet(
  input: { email: string; tenant?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true }> {
  const csrf = await getCSRFToken()
  await fetchImpl(`${DOTNET_PROXY_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({ email: input.email, tenant: input.tenant ?? null }),
  }).catch(() => null)
  return { ok: true }
}

export interface DotnetTenantSignUpInput {
  pharmacyName: string
  slug: string
  adminFirstName: string
  adminLastName: string
  adminEmail: string
  /** Omitted for sign-up with Google. */
  adminPassword?: string
  adminConfirmPassword?: string
  phoneNumber?: string
  /** Sign up with Google instead of a password. */
  googleIdToken?: string
}

export type DotnetTenantSignUpResult =
  | { ok: true; tenantId: string; provisioningCorrelationId: string | null; status: string | null }
  | { ok: false; code: string; message: string }

/**
 * Self-service tenant signup through the BFF at /api/dotnet/tenants/signup. Anonymous: creates a
 * brand-new tenant and its Admin user in one call, on the platform's default free plan — no
 * payment is collected and there is no "wait for an administrator" step. Provisioning continues in
 * the background; follow it with getSignUpStatus.
 */
export async function signUpTenantWithDotnet(
  input: DotnetTenantSignUpInput,
  fetchImpl: typeof fetch = fetch,
): Promise<DotnetTenantSignUpResult> {
  const csrf = await getCSRFToken()
  const google = Boolean(input.googleIdToken)
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/tenants/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({
      pharmacyName: input.pharmacyName,
      slug: input.slug,
      adminFirstName: input.adminFirstName,
      adminLastName: input.adminLastName,
      adminEmail: input.adminEmail,
      adminPassword: google ? null : (input.adminPassword ?? null),
      adminConfirmPassword: google ? null : (input.adminConfirmPassword ?? null),
      phoneNumber: input.phoneNumber ?? null,
      googleIdToken: input.googleIdToken ?? null,
    }),
  })
  const body = await res.json().catch(() => null)
  if (res.ok) {
    const parsed = (body ?? {}) as { tenantId?: unknown; provisioningCorrelationId?: unknown; status?: unknown }
    return typeof parsed.tenantId === "string"
      ? {
          ok: true,
          tenantId: parsed.tenantId,
          provisioningCorrelationId: typeof parsed.provisioningCorrelationId === "string" ? parsed.provisioningCorrelationId : null,
          status: typeof parsed.status === "string" ? parsed.status : null,
        }
      : { ok: false, code: "INTERNAL", message: "Unexpected response from server" }
  }
  return { ok: false, ...toDotnetSignInError(res.status, body) }
}

export interface SignUpStatus {
  tenantId: string
  /** Pending | Running | Completed | Failed */
  status: string
  currentStep: string | null
  error: string | null
  steps: { step: string; status: string }[]
}

/** Provisioning progress of a sign-up (anonymous; needs the correlation id the sign-up returned). */
export async function getSignUpStatus(
  tenantId: string,
  correlationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignUpStatus | null> {
  const params = new URLSearchParams({ tenantId, correlationId })
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/tenants/signup/status?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  })
  if (!res.ok) return null
  return (await res.json()) as SignUpStatus
}

export interface SignUpAvailability {
  slugAvailable: boolean | null
  slugMessage: string | null
  nameAvailable: boolean | null
  nameMessage: string | null
}

/** Whether a pharmacy code and/or name is still free. Returns null when the check itself fails. */
export async function checkSignUpAvailability(
  query: { slug?: string; name?: string },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<SignUpAvailability | null> {
  const params = new URLSearchParams()
  if (query.slug) params.set("slug", query.slug)
  if (query.name) params.set("name", query.name)
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/tenants/signup/availability?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  }).catch(() => null)
  if (!res?.ok) return null
  return (await res.json()) as SignUpAvailability
}

export interface GooglePharmacyChoice {
  tenantId: string
  tenantName: string
}

export type GoogleSignInResult =
  | { ok: true }
  | { ok: false; needsPharmacy: true; email: string; pharmacies: GooglePharmacyChoice[] }
  | { ok: false; needsPharmacy?: false; code: string; message: string }

/**
 * Sign in with a Google ID token. With no pharmacy code the server finds the pharmacies this Google
 * account is connected to; when there are several it returns them for the user to pick, and the
 * caller retries with the same token and the chosen `tenant`.
 */
export async function signInWithGoogle(
  input: { idToken: string; tenant?: string; twoFactorCode?: string; recoveryCode?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleSignInResult> {
  const csrf = await getCSRFToken()
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({
      idToken: input.idToken,
      tenant: input.tenant || null,
      twoFactorCode: input.twoFactorCode ?? null,
      recoveryCode: input.recoveryCode ?? null,
    }),
  })
  const body = await res.json().catch(() => null)
  if (res.ok) {
    const parsed = (body ?? {}) as { ok?: unknown; needsPharmacy?: unknown; email?: unknown; pharmacies?: unknown }
    if (parsed.needsPharmacy === true && Array.isArray(parsed.pharmacies)) {
      return {
        ok: false,
        needsPharmacy: true,
        email: typeof parsed.email === "string" ? parsed.email : "",
        pharmacies: parsed.pharmacies as GooglePharmacyChoice[],
      }
    }
    return { ok: true }
  }
  return { ok: false, ...toDotnetSignInError(res.status, body) }
}

export interface GoogleSignUpProfile {
  email: string
  firstName: string | null
  lastName: string | null
  picture: string | null
}

/** Verifies a Google account for pharmacy sign-up and returns its profile to prefill the form. */
export async function verifyGoogleSignUp(
  idToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; profile: GoogleSignUpProfile } | { ok: false; code: string; message: string }> {
  const csrf = await getCSRFToken()
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/auth/google/verify-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({ idToken }),
  })
  const body = await res.json().catch(() => null)
  if (res.ok) return { ok: true, profile: body as GoogleSignUpProfile }
  return { ok: false, ...toDotnetSignInError(res.status, body) }
}

export type DotnetResetPasswordResult = { ok: true } | { ok: false; code: string; message: string }

/** Completes a password reset through the BFF at /api/dotnet/auth/reset-password, using the token from the emailed link. */
export async function resetPasswordWithDotnet(
  input: { email: string; token: string; password: string; tenant?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DotnetResetPasswordResult> {
  const csrf = await getCSRFToken()
  const res = await fetchImpl(`${DOTNET_PROXY_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify({
      email: input.email,
      token: input.token,
      password: input.password,
      tenant: input.tenant ?? null,
    }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => null)
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
  /** .NET permission claims (same array requirePermission/dotnetPermissionAllowed enforce server-side). */
  permissions: string[]
}

/** Maps the .NET profile and session role/permissions onto the fields the dashboard layout displays. Pure. */
export function dashboardUserInfoFromDotnet(
  profile: DotnetProfileDto,
  role: string | null,
  permissions: readonly string[] = [],
): DashboardUserInfo {
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
  return { name, role: rawRole, rawRole, initials, permissions: [...permissions] }
}

/**
 * Loads the signed-in user's id and display fields. The name comes from the .NET profile endpoint
 * (through the BFF proxy). The role and permissions come from the BFF session route, because UserDto
 * carries neither. Returns null on any failure so the layout keeps its empty state.
 */
export async function loadDotnetCurrentUser(
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; info: DashboardUserInfo } | null> {
  try {
    const [profile, session] = await Promise.all([
      dotnetClient.get<DotnetProfileDto>("/identity/profile"),
      fetchImpl(`${DOTNET_PROXY_BASE}/auth/session`, { credentials: "same-origin" }).then((res) =>
        res.ok ? (res.json() as Promise<{ user?: { role?: string | null; permissions?: string[] } }>) : null,
      ),
    ])
    if (!profile?.id) return null
    return {
      id: profile.id,
      info: dashboardUserInfoFromDotnet(profile, session?.user?.role ?? null, session?.user?.permissions ?? []),
    }
  } catch {
    return null
  }
}
