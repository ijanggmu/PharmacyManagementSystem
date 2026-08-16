import { z } from "zod"

/**
 * Client-side validation for the Add/Edit Medicine forms. Mirrors the rules in
 * lib/utils/validation.ts (medicineSchema), but works directly against the raw
 * values the form's <Input>/<Select> controls produce. Numeric fields are stored
 * as strings in the Create form but as numbers in the Edit form (it seeds from
 * the already-typed Medicine record), so those fields coerce to string first.
 * Used to render errors under each field instead of only surfacing them via toast.
 */
const numericFieldToString = z.preprocess(
  (v) => (v == null ? "" : String(v)),
  z.string().trim()
)

export const medicineFormSchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required"),
  generic_name: z.string().trim().optional(),
  brand_name: z.string().trim().optional(),
  strength: z.string().trim().optional(),
  form: z.string().trim().min(1, "Form is required"),
  unit_price: numericFieldToString
    .refine((v) => v.length > 0, "Selling price is required")
    .refine((v) => !Number.isNaN(Number(v)), "Must be a number")
    .refine((v) => Number(v) > 0, "Must be greater than 0"),
  cost_price: numericFieldToString
    .refine((v) => v.length > 0, "Cost price is required")
    .refine((v) => !Number.isNaN(Number(v)), "Must be a number")
    .refine((v) => Number(v) >= 0, "Cannot be negative"),
  stock_quantity: numericFieldToString
    .refine((v) => v.length > 0, "Stock quantity is required")
    .refine((v) => Number.isInteger(Number(v)), "Must be a whole number")
    .refine((v) => Number(v) >= 0, "Cannot be negative"),
  minimum_stock: numericFieldToString
    .refine((v) => v.length > 0, "Minimum stock is required")
    .refine((v) => Number.isInteger(Number(v)), "Must be a whole number")
    .refine((v) => Number(v) >= 0, "Cannot be negative"),
  maximum_stock: numericFieldToString
    .refine((v) => v.length > 0, "Maximum stock is required")
    .refine((v) => Number.isInteger(Number(v)), "Must be a whole number")
    .refine((v) => Number(v) >= 0, "Cannot be negative"),
  expiry_date: z.string().trim().min(1, "Expiry date is required"),
  batch_number: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  side_effects: z.string().trim().optional(),
  storage_instructions: z.string().trim().optional(),
  description: z.string().trim().optional(),
}).refine(
  (data) => {
    const min = Number(data.minimum_stock)
    const max = Number(data.maximum_stock)
    return Number.isNaN(min) || Number.isNaN(max) || max >= min
  },
  { message: "Maximum stock cannot be less than minimum stock", path: ["maximum_stock"] }
).refine(
  (data) => {
    const price = Number(data.unit_price)
    const cost = Number(data.cost_price)
    return Number.isNaN(price) || Number.isNaN(cost) || price >= cost
  },
  { message: "Selling price is below cost price", path: ["unit_price"] }
)

export type MedicineFormErrors = Partial<Record<string, string>>

/** Runs the schema and returns a flat field->message map for inline display. */
export function validateMedicineForm(data: Record<string, unknown>): MedicineFormErrors {
  const result = medicineFormSchema.safeParse(data)
  if (result.success) return {}

  const errors: MedicineFormErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message
    }
  }
  return errors
}
