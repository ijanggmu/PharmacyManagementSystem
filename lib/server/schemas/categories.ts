import { z } from "zod"

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(100, "Category name too long"),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
