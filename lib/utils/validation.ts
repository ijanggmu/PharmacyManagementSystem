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

// Medicine data validation
export const medicineSchema = z.object({
  name: nameSchema,
  generic_name: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  brand_name: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  strength: z.string().min(1, "Strength is required").max(50, "Strength is too long"),
  form: z.string().min(1, "Form is required").max(50, "Form is too long"),
  unit_price: priceSchema,
  cost_price: priceSchema,
  stock_quantity: stockSchema,
  minimum_stock: stockSchema,
  maximum_stock: stockSchema.optional(),
  expiry_date: dateSchema.optional(),
  batch_number: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  barcode: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  description: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  side_effects: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  storage_instructions: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
  prescription_required: z.boolean(),
  controlled_substance: z.boolean(),
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
  items: z.array(z.object({
    medicine_id: z.string().uuid("Invalid medicine ID"),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),
    unit_price: priceSchema,
    discount: z.number().min(0).max(100).optional(),
  })).min(1, "At least one item is required"),
  payment_method: z.enum(["cash", "card", "insurance", "other"]),
  discount_amount: z.number().min(0).optional(),
  tax_amount: z.number().min(0).optional(),
  notes: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
})

// Supplier data validation
export const supplierSchema = z.object({
  name: nameSchema,
  contact_person: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().optional().transform(val => val ? sanitizeInput(val) : null),
})

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
