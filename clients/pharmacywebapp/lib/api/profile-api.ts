/**
 * Self-service profile update on the .NET API (PUT /api/v1/identity/profile). Any signed-in user may edit
 * their own name and phone; the server ignores any id in the body and the email is not changeable here.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"

export interface OwnProfileUpdate {
  firstName: string
  lastName: string
  phoneNumber: string | null
}

export async function updateOwnProfile(update: OwnProfileUpdate): Promise<void> {
  await dotnetClient.put<void>("/api/v1/identity/profile", update)
}

/** POST /identity/change-password. The server has no validator, so callers must send all three fields. */
export async function changeOwnPassword(input: {
  password: string
  newPassword: string
  confirmNewPassword: string
}): Promise<void> {
  await dotnetClient.post<string>("/api/v1/identity/change-password", input)
}

/** Identity TwoFactorEnrollmentResponse: base32 secret plus the otpauth:// URI to render as a QR code. */
export interface TwoFactorEnrollment {
  sharedKey: string
  authenticatorUri: string
}

/** Starts (or restarts) authenticator enrollment. Rotates the secret; 2FA stays off until verified. */
export async function enrollTwoFactor(): Promise<TwoFactorEnrollment> {
  return dotnetClient.post<TwoFactorEnrollment>("/api/v1/identity/2fa/enroll", {})
}

/** Identity TwoFactorVerifyResponse. recoveryCodes is issued once, at enrollment. */
interface TwoFactorVerifyResponse {
  success: boolean
  recoveryCodes?: string[] | null
}

/**
 * Confirms enrollment with a 6-digit code; on success every later sign-in needs a code. Returns the
 * one-time recovery codes the server issues with it (shown to the user once, never again).
 */
export async function verifyTwoFactorEnrollment(code: string): Promise<{ recoveryCodes: string[] }> {
  const res = await dotnetClient.post<TwoFactorVerifyResponse>("/api/v1/identity/2fa/verify", { code })
  return { recoveryCodes: res?.recoveryCodes ?? [] }
}

/** Turns 2FA off. The server requires the current password so a stolen token alone can't do it. */
export async function disableTwoFactor(currentPassword: string): Promise<void> {
  await dotnetClient.post<{ success: boolean }>("/api/v1/identity/2fa/disable", { currentPassword })
}

/** Identity TwoFactorStatusResponse. */
export interface TwoFactorStatus {
  enabled: boolean
  recoveryCodesLeft: number
}

/** GET /identity/2fa/status — the caller's 2FA flag and unused recovery-code count. */
export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return dotnetClient.get<TwoFactorStatus>("/api/v1/identity/2fa/status")
}

/** Replaces the caller's recovery codes (password-confirmed). Earlier codes stop working. */
export async function regenerateRecoveryCodes(currentPassword: string): Promise<string[]> {
  const res = await dotnetClient.post<{ recoveryCodes?: string[] | null }>("/api/v1/identity/2fa/recovery-codes", {
    currentPassword,
  })
  return res?.recoveryCodes ?? []
}

/** Identity UserSessionDto (camelCase). */
export interface OwnSession {
  id: string
  ipAddress?: string | null
  deviceType?: string | null
  browser?: string | null
  browserVersion?: string | null
  operatingSystem?: string | null
  osVersion?: string | null
  createdAt: string
  lastActivityAt: string
  expiresAt: string
  isActive: boolean
  isCurrentSession: boolean
}

/** GET /identity/sessions/me — requires Permissions.Sessions.View. */
export async function listOwnSessions(): Promise<OwnSession[]> {
  return dotnetClient.get<OwnSession[]>("/api/v1/identity/sessions/me")
}

/** DELETE /identity/sessions/{id} — requires Permissions.Sessions.Revoke. */
export async function revokeOwnSession(sessionId: string): Promise<void> {
  await dotnetClient.delete<void>(`/api/v1/identity/sessions/${encodeURIComponent(sessionId)}`)
}

export const SESSIONS_VIEW_PERMISSION = "Permissions.Sessions.View"
export const SESSIONS_REVOKE_PERMISSION = "Permissions.Sessions.Revoke"
