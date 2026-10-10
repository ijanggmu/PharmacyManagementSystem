/**
 * Pure helpers for authenticator (TOTP) sign-in. The .NET IdentityService signals the 2FA step with a
 * 401 whose detail starts with a machine prefix (see IdentityService.VerifyTwoFactorOrThrowAsync):
 * - "two_factor_required: …" — the password was right, a code is needed.
 * - "two_factor_invalid: …"  — the code was wrong or expired.
 * The BFF passes that detail through as the normalized error's message.
 */

export const TOTP_LENGTH = 6

export type TwoFactorSignInState = "required" | "invalid" | null

const PREFIX = /^\s*(two_factor_required|two_factor_invalid)\s*:\s*/i

export function twoFactorSignInState(message: string | null | undefined): TwoFactorSignInState {
  const match = message?.match(PREFIX)
  if (!match) return null
  return match[1].toLowerCase() === "two_factor_required" ? "required" : "invalid"
}

/** The human part of a prefixed server message ("two_factor_invalid: The code…" → "The code…"). */
export function stripTwoFactorPrefix(message: string): string {
  return message.replace(PREFIX, "")
}

/** Keeps digits only, capped at the TOTP length — so pasted "123 456" or "123-456" works. */
export function sanitizeTotp(input: string): string {
  return input.replace(/\D/g, "").slice(0, TOTP_LENGTH)
}

export function isCompleteTotp(code: string): boolean {
  return code.length === TOTP_LENGTH && /^\d+$/.test(code)
}

/** Characters on each side of the hyphen in an ASP.NET Identity recovery code ("XXXXX-XXXXX"). */
const RECOVERY_HALF = 5
/** Upper bound for what the field accepts, so a pasted paragraph can't be submitted. */
export const RECOVERY_CODE_MAX_INPUT = 24

/**
 * Normalizes a typed or pasted recovery code to the form Identity stores ("XXXXX-XXXXX", upper case).
 * Identity redeems by exact match, so spaces, lower case or a dropped hyphen would otherwise fail.
 * The server normalizes the same way; doing it here keeps what the user sees consistent.
 */
export function normalizeRecoveryCode(input: string): string {
  const compact = input.replace(/[^a-z0-9]/gi, "").toUpperCase()
  return compact.length === RECOVERY_HALF * 2
    ? `${compact.slice(0, RECOVERY_HALF)}-${compact.slice(RECOVERY_HALF)}`
    : compact
}

/** True once the input holds a full ten-character recovery code (hyphen and spacing optional). */
export function isCompleteRecoveryCode(input: string): boolean {
  return /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalizeRecoveryCode(input))
}

/** Plain-text file body for the "Download" button next to freshly issued recovery codes. */
export function recoveryCodesFileText(
  codes: readonly string[],
  account?: string | null,
  issuedAt: Date = new Date(),
): string {
  return [
    "PharmaCare two-step verification recovery codes",
    ...(account ? [`Account: ${account}`] : []),
    `Generated: ${issuedAt.toISOString()}`,
    "",
    "Each code works once. Keep them somewhere safe and private.",
    "",
    ...codes,
    "",
  ].join("\n")
}

/** Remaining-codes count at which the profile warns the user to regenerate. */
export const RECOVERY_CODES_LOW_THRESHOLD = 3

export function isLowOnRecoveryCodes(left: number): boolean {
  return left <= RECOVERY_CODES_LOW_THRESHOLD
}

/** Groups a base32 secret in blocks of four for manual entry ("ABCDEFGH" → "ABCD EFGH"). */
export function formatSharedKey(key: string): string {
  return key.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim()
}
