import { z } from "zod"

// Input sanitization function
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
}

// Email validation
export const emailSchema = z
  .string()
  .email("Invalid email format")
  .min(1, "Email is required")
  .max(255, "Email is too long")
  .transform(sanitizeInput)

// Phone validation
export const phoneSchema = z
  .string()
  .regex(/^[\+]?[1-9][\d]{0,15}$/, "Invalid phone number format")
  .min(10, "Phone number is too short")
  .max(15, "Phone number is too long")
  .transform(sanitizeInput)

// Name validation
export const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be less than 50 characters")
  .regex(/^[a-zA-Z\s\-']+$/, "Name contains invalid characters")
  .transform(sanitizeInput)

// Medicine names routinely include strengths/units and punctuation (e.g. "Aclov Cream 10g",
// "Panadol 500mg", "Co-Amoxiclav 625"), unlike person names, so they need their own regex.
export const medicineNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(120, "Name must be less than 120 characters")
  .regex(/^[a-zA-Z0-9\s\-'.,%/()]+$/, "Name contains invalid characters")
  .transform(sanitizeInput)

// Supplier legal/trade names often include numbers and punctuation
export const supplierNameSchema = z
  .string()
  .min(2, "Supplier name must be at least 2 characters")
  .max(120, "Supplier name must be less than 120 characters")
  .regex(/^[a-zA-Z0-9\s\-'.&,()/]+$/, "Supplier name contains invalid characters")
  .transform(sanitizeInput)

export const supplierContactSchema = z
  .string()
  .min(2, "Contact must be at least 2 characters")
  .max(80, "Contact must be less than 80 characters")
  .regex(/^[a-zA-Z0-9\s\-'.+,()/]+$/, "Contact contains invalid characters")
  .transform(sanitizeInput)

// Price validation
export const priceSchema = z
  .number()
  .min(0.01, "Price must be greater than 0")
  .max(10000, "Price cannot exceed $10,000")

// Stock validation
export const stockSchema = z
  .number()
  .int("Stock must be a whole number")
  .min(0, "Stock cannot be negative")
  .max(100000, "Stock cannot exceed 100,000")

// Date validation
export const dateSchema = z
  .string()
  .refine((date) => !isNaN(Date.parse(date)), "Invalid date format")
  .refine((date) => new Date(date) > new Date(), "Date must be in the future")

// Expiry date validation (allows past dates for expired items)
export const expiryDateSchema = z
  .string()
  .refine((date) => !isNaN(Date.parse(date)), "Invalid date format")
  .nullable()
  .optional()

// Medicine data validation
export const medicineSchema = z.object({
  name: medicineNameSchema,
  generic_name: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  brand_name: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  strength: z.string().max(50, "Strength is too long").nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  form: z.string().min(1, "Form is required").max(50, "Form is too long").transform(sanitizeInput),
  unit_price: priceSchema,
  cost_price: priceSchema,
  stock_quantity: stockSchema,
  minimum_stock: stockSchema,
  maximum_stock: stockSchema.optional(),
  expiry_date: expiryDateSchema, // Allows past dates for expired items
  batch_number: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  barcode: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  description: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  side_effects: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  storage_instructions: z.string().nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  category_id: z.string().uuid("Invalid category ID").nullable().optional(),
  supplier_id: z.string().uuid("Invalid supplier ID").nullable().optional(),
  prescription_required: z.boolean(),
  controlled_substance: z.boolean(),
  is_taxable: z.boolean().optional(),
  /** Supplier tax invoice / bill number for the initial stock receipt (optional). */
  supplier_invoice_number: z.string().max(120).nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  /** Recoverable VAT on the initial stock receipt, if any. */
  vat_amount: z.number().min(0).nullable().optional(),
  /** Required whenever an update decreases stock_quantity manually — see
   *  updateMedicineWithInventory, which audits the decrease to inventory_transactions. */
  stock_adjustment_reason: z.enum(["breakage", "theft", "expiry_writeoff", "count_correction", "other"]).nullable().optional(),
  stock_adjustment_notes: z.string().max(500).nullable().optional().transform(val => val ? sanitizeInput(val) : null),
  requires_cold_chain: z.boolean().optional(),
  storage_temp_min_c: z.number().min(-50).max(50).nullable().optional(),
  storage_temp_max_c: z.number().min(-50).max(50).nullable().optional(),
  units_per_pack: z.number().int().min(1).nullable().optional(),
  unit_label: z.string().max(30).nullable().optional().transform(val => val ? sanitizeInput(val) : null),
})

// Customer data validation
export const customerSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  date_of_birth: z.string().optional().refine(
    (date) => !date || !isNaN(Date.parse(date)),
    "Invalid date format"
  ),
  insurance_info: z.any().optional(),
  /** Feeds checkAllergies() at sale time (see lib/utils/drug-interactions.ts) —
   *  free-text substance names, not a coded allergy list. */
  allergies: z.array(z.string().trim().min(1)).max(50).optional(),
  chronic_conditions: z.array(z.string().trim().min(1)).max(50).optional(),
  current_medications: z.array(z.string().trim().min(1)).max(50).optional(),
})

// Prescription data validation
export const prescriptionSchema = z.object({
  customer_id: z.string().uuid("Invalid customer ID"),
  doctor_name: nameSchema,
  doctor_license: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  issue_date: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    "Invalid issue date"
  ),
  /** Enforced at dispense time by create_sale_with_items — a sale against an expired
   *  prescription is rejected. Optional so existing/legacy prescriptions without one
   *  never expire (no staleness check for them, same as before this field existed). */
  expiry_date: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    "Invalid expiry date"
  ).nullable().optional(),
  notes: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  prescription_items: z.array(z.object({
    medicine_id: z.string().uuid("Invalid medicine ID"),
    quantity_prescribed: z.number().int().min(1, "Quantity must be at least 1"),
    dosage_instructions: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  })).min(1, "At least one prescription item is required"),
})

// Sale data validation
export const saleSchema = z.object({
  customer_id: z.string().uuid("Invalid customer ID").optional(),
  /** Client-generated idempotency key (e.g. offline-queued sales) — replaying the same
   *  key returns the original sale instead of creating a duplicate. */
  client_request_id: z.string().uuid().optional(),
  /** Prescription this sale dispenses against. Required server-side (create_sale_with_items
   *  rejects the sale) if any cart item is a prescription_required medicine. */
  prescription_id: z.string().uuid("Invalid prescription ID").optional(),
  items: z.array(z.object({
    medicine_id: z.string().uuid("Invalid medicine ID"),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),
    unit_price: priceSchema,
    discount: z.number().min(0).max(100).optional(),
  })).min(1, "At least one item is required"),
  /** Split-tender payment legs — usually one entry, but can be several (e.g. cash +
   *  card) whose amounts must sum to the sale total. Validated against the
   *  server-computed total in createSaleWithRpc, not here (the total isn't known
   *  until items are re-priced from the catalog). */
  payments: z.array(z.object({
    method: z.enum([
      "cash",
      "card",
      "insurance",
      "fonepay",
      "esewa",
      "khalti",
      "bank",
      "credit",
      "other",
    ]),
    amount: priceSchema,
  })).min(1, "At least one payment is required"),
  discount_amount: z.number().min(0).optional(),
  /** Ignored server-side — tax is always recomputed from the catalog, each item's
   *  is_taxable flag, and the tenant's tax_rate setting. Kept optional so older
   *  clients that still send it don't fail validation. */
  tax_amount: z.number().min(0).optional(),
  notes: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  /** Set by the client after the user has reviewed and dismissed a SAFETY_WARNING
   *  (drug interaction / allergy) response from a first submit attempt. */
  acknowledge_safety_warnings: z.boolean().optional(),
}).refine(
  (data) => !data.payments.some((p) => p.method === "credit") || Boolean(data.customer_id),
  { message: "Customer is required for credit sales", path: ["customer_id"] }
)

// Supplier data validation
export const supplierSchema = z.object({
  name: supplierNameSchema,
  contact_person: supplierContactSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  reconciliation_account_ref: z
    .string()
    .max(150)
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() ? sanitizeInput(val.trim()) : null)),
})

export type SupplierInput = z.infer<typeof supplierSchema>

// User data validation
export const userSchema = z.object({
  email: emailSchema,
  full_name: nameSchema,
  role: z.enum(["admin", "pharmacist", "cashier"]),
  phone: phoneSchema.optional(),
})

// Validation helper functions
export function validateAndSanitize<T>(data: any, schema: z.ZodSchema<T>): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ')
      throw new Error(`Validation failed: ${errorMessages}`)
    }
    throw error
  }
}

// Partial validation for updates - simplified version
export function validatePartial<T>(data: any, schema: z.ZodSchema<T>): Partial<T> {
  try {
    // For now, just return the data as-is since partial validation is complex
    // In a production app, you'd want to implement proper partial validation
    return data as Partial<T>
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ')
      throw new Error(`Validation failed: ${errorMessages}`)
    }
    throw error
  }
}

// All schemas are already exported above
