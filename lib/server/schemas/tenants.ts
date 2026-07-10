import { z } from "zod"

const tenantAdminBaseSchema = z.object({
  pharmacyName: z.string().trim().min(1, "Pharmacy name is required").max(200),
  legalName: z.string().trim().max(200).optional().nullable(),
  licenseNumber: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  timezone: z.string().trim().max(100).optional().nullable(),
  currency: z.string().trim().max(10).optional().nullable(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional().nullable(),
  adminFullName: z.string().trim().max(200).optional().nullable(),
  adminEmail: z.string().trim().email("A valid admin email is required"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  planCode: z.string().trim().max(50).optional().nullable(),
})

export const createTenantSchema = tenantAdminBaseSchema

export type CreateTenantInput = z.infer<typeof createTenantSchema>

export const onboardingSchema = tenantAdminBaseSchema.extend({
  pharmacyCode: z.string().trim().max(60).optional().nullable(),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
