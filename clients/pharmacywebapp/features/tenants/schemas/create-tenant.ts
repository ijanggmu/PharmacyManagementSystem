import { z } from "zod"
import { passwordPolicyError } from "@/lib/utils/password-policy"

/**
 * New-tenant form. The tenant code is not entered: the API derives a unique one from the pharmacy name
 * (previewed via GET /tenants/code-suggestion). Mirrors CreateTenantCommandValidator so errors show
 * before the round trip; the API validates again.
 */
export const createTenantSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the pharmacy name")
      .min(2, "Pharmacy name must be at least 2 characters")
      .max(200, "Pharmacy name must be at most 200 characters"),
    adminEmail: z
      .string()
      .trim()
      .min(1, "Enter the admin email")
      .max(256, "Admin email must be at most 256 characters")
      .email("Enter a valid email, like owner@pharmacy.com"),
    adminPassword: z
      .string()
      .max(128, "Password must be at most 128 characters")
      .superRefine((value, ctx) => {
        const error = passwordPolicyError(value)
        if (error) ctx.addIssue({ code: "custom", message: error })
      }),
    confirmPassword: z.string().min(1, "Re-enter the password"),
  })
  .refine((v) => v.confirmPassword === v.adminPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

export type CreateTenantForm = z.infer<typeof createTenantSchema>
