import { z } from "zod"

/**
 * Client-side validation for the Add/Edit Medicine forms. Mirrors the rules in
 * lib/utils/validation.ts (medicineSchema), but works directly against the raw
 * values the form's <Input>/<Select> controls produce. Numeric fields are stored
 * as strings in the Create form but as numbers in the Edit form (it seeds from
 * the already-typed Medicine record), so those fields coerce to string first.
 * Used to render errors under each field instead of only surfacing them via toast.
 *
 * DRIFT WARNING (2026-08 cleanup audit): this is a hand-maintained mirror of
 * medicineSchema in lib/utils/validation.ts, not a derived/shared source — the
 * two already drifted once this session (`strength` had to be changed from
 * required to optional in both files separately). If you change which fields
 * are required/optional or add a cross-field rule here, make the matching
 * change in validation.ts's medicineSchema too, and vice versa.
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
  // Required only with opening stock (checked below): a medicine saved with 0 stock has no batch to expire.
  expiry_date: z.string().trim(),
  batch_number: z.string().trim().optional(),
  rack_location: z.string().trim().max(60, "Rack is too long").optional(),
  barcode: z.string().trim().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  side_effects: z.string().trim().optional(),
  storage_instructions: z.string().trim().optional(),
  description: z.string().trim().optional(),
  units_per_pack: numericFieldToString,
  // Box › pack › base: a box holds whole packs (at least 2) and needs a pack size.
  packs_per_box: numericFieldToString
    .refine((v) => v.length === 0 || (Number.isInteger(Number(v)) && Number(v) >= 2), "A box holds at least 2 packs"),
  box_label: z.string().trim().max(50, "Box label is too long").optional(),
}).refine(
  (data) => data.expiry_date.length > 0 || !(Number(data.stock_quantity) > 0),
  { message: "Expiry date is required", path: ["expiry_date"] }
).refine(
  (data) => data.packs_per_box.length === 0 || data.units_per_pack.length > 0,
  { message: "Set the units per pack first", path: ["packs_per_box"] }
).refine(
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

/**
 * The edit form's rules: the same as create, minus the stock quantity and expiry date, which
 * belong to batches and change only through Add stock / Adjust stock.
 */
export function validateMedicineEditForm(data: Record<string, unknown>): MedicineFormErrors {
  const { stock_quantity: _stock, expiry_date: _expiry, ...errors } = validateMedicineForm({
    ...data,
    stock_quantity: data.stock_quantity ?? 0,
    expiry_date: "n/a",
  })
  return errors
}

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
