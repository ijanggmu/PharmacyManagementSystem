import { z } from "zod"

export const upsertSettingSchema = z.object({
  key: z.string().trim().min(1, "Key is required"),
  value: z.union([z.string(), z.number(), z.boolean()]),
  type: z.string().trim().optional(),
})

export type UpsertSettingInput = z.infer<typeof upsertSettingSchema>
