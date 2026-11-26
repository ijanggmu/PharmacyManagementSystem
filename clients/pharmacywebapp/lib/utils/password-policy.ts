/**
 * Mirrors the .NET Identity password options (IdentityModule: RequiredLength =
 * IdentityModuleConstants.PasswordLength (10), RequireDigit, RequireLowercase, RequireUppercase,
 * no symbol required) so forms can show the rules before the server rejects a password.
 */

export const PASSWORD_MIN_LENGTH = 10

export interface PasswordRule {
  id: "length" | "upper" | "lower" | "digit"
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "digit", label: "A number", test: (p) => /\d/.test(p) },
]

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}

/** zod-free check list of failed rule labels, for form error text ("Add: an uppercase letter, a number"). */
export function passwordPolicyError(password: string): string | null {
  if (!password) return "Enter a password"
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label.toLowerCase())
  return missing.length === 0 ? null : `Password needs ${missing.join(", ")}`
}

/**
 * A random 14-character password that meets the policy, for an admin handing out first-time credentials.
 * Ambiguous characters (0/O, 1/l/I) are left out so it can be read off paper.
 */
export function generateStrongPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghijkmnpqrstuvwxyz"
  const digits = "23456789"
  const all = upper + lower + digits
  const pick = (set: string) => {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return set[buf[0] % set.length]
  }
  const chars = [pick(upper), pick(lower), pick(digits)]
  while (chars.length < Math.max(length, PASSWORD_MIN_LENGTH)) chars.push(pick(all))
  // Fisher-Yates so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}
