import { z } from "zod"

/** Mirrors CreateBranchCommandValidator / UpdateBranchCommandValidator on the .NET side. */
export const branchFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  code: z.string().trim().min(1, "Code is required").max(32, "Code must be 32 characters or fewer"),
  address: z.string().trim().max(300, "Address must be 300 characters or fewer"),
  phone: z.string().trim().max(32, "Phone must be 32 characters or fewer"),
  email: z
    .string()
    .trim()
    .max(256, "Email must be 256 characters or fewer")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address"),
  isActive: z.boolean(),
})

export type BranchFormValues = z.infer<typeof branchFormSchema>

export type BranchFormErrors = Partial<Record<keyof BranchFormValues, string>>

export function validateBranchForm(values: BranchFormValues): BranchFormErrors {
  const result = branchFormSchema.safeParse(values)
  if (result.success) return {}
  const errors: BranchFormErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof BranchFormValues | undefined
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}
