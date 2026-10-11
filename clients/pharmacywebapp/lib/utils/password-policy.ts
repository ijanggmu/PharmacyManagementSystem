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
