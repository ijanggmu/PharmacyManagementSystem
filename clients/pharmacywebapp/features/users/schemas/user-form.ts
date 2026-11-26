import { z } from "zod"
import { passwordPolicyError } from "@/lib/utils/password-policy"

/**
 * Staff user forms. Mirrors the Identity validators (RegisterUser / AdminUpdateUser / AdminSetPassword) so
 * errors show next to the field before the round trip; the API validates again.
 */

const fullName = z
  .string()
  .trim()
  .min(1, "Enter the person's full name")
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters")

/** Optional Nepali or international number: 7-16 digits, spaces, hyphens, optional leading +. */
const phone = z
  .string()
  .trim()
  .max(20, "Phone number is too long")
  .refine((v) => v === "" || /^\+?[0-9\s-]{7,16}$/.test(v), "Enter a valid phone number, like 98XXXXXXXX")

const roles = z.array(z.string()).min(1, "Choose at least one role")

const password = z
  .string()
  .max(128, "Password must be at most 128 characters")
  .superRefine((value, ctx) => {
    const error = passwordPolicyError(value)
    if (error) ctx.addIssue({ code: "custom", message: error })
  })

export const addUserSchema = z.object({
  fullName,
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address")
    .max(256, "Email must be at most 256 characters")
    .email("Enter a valid email, like name@pharmacy.com"),
  phone,
  roles,
  branchId: z.string().min(1, "Choose a branch"),
  password,
})
export type AddUserForm = z.infer<typeof addUserSchema>

export const editUserSchema = z.object({
  fullName,
  phone,
  roles,
  branchId: z.string(),
})
export type EditUserForm = z.infer<typeof editUserSchema>

export const setPasswordSchema = z
  .object({ password, confirmPassword: z.string().min(1, "Re-enter the password") })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
export type SetPasswordForm = z.infer<typeof setPasswordSchema>

/** First message per field, for inline errors. */
export function fieldErrorsOf<T extends Record<string, unknown>>(
  schema: z.ZodType<T>,
  values: unknown,
): Partial<Record<keyof T, string>> {
  const parsed = schema.safeParse(values)
  if (parsed.success) return {}
  const errors: Partial<Record<keyof T, string>> = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof T
    errors[field] ??= issue.message
  }
  return errors
}
