import { z } from "zod"

/** Tenant codes match the login route rule (lowercase letters, digits, hyphens; 1-64 characters). */
export const createTenantSchema = z.object({
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,64}$/, "Use 1-64 lowercase letters, digits or hyphens"),
  name: z.string().trim().min(2, "Enter the pharmacy name").max(200, "Name is too long"),
  adminEmail: z.string().trim().email("Enter a valid admin email"),
  adminPassword: z.string().min(8, "Admin password must be at least 8 characters"),
})

export type CreateTenantForm = z.infer<typeof createTenantSchema>
