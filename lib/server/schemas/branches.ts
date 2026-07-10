import { z } from "zod"

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  code: z.string().trim().min(1, "code is required").max(60),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  is_active: z.boolean().optional(),
})

export type CreateBranchInput = z.infer<typeof createBranchSchema>

export const updateBranchSchema = createBranchSchema.partial()

export type UpdateBranchInput = z.infer<typeof updateBranchSchema>
