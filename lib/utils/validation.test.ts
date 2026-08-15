import { describe, it, expect } from "vitest"
import {
  sanitizeInput,
  emailSchema,
  phoneSchema,
  nameSchema,
  priceSchema,
  stockSchema,
  expiryDateSchema,
  medicineSchema,
  customerSchema,
  prescriptionSchema,
  saleSchema,
  supplierSchema,
  userSchema,
} from "@/lib/utils/validation"

describe("sanitizeInput", () => {
  it("strips angle brackets, javascript: protocol, and event handlers", () => {
    expect(sanitizeInput("<script>alert(1)</script>")).toBe("scriptalert(1)/script")
    expect(sanitizeInput("javascript:alert(1)")).toBe("alert(1)")
    expect(sanitizeInput('onclick=alert(1)')).toBe("alert(1)")
    expect(sanitizeInput("  Napa 500mg  ")).toBe("Napa 500mg")
  })
})

describe("emailSchema / phoneSchema / nameSchema", () => {
  it("accepts valid values", () => {
    expect(emailSchema.parse("a@b.com")).toBe("a@b.com")
    expect(phoneSchema.parse("+9779812345678")).toBe("+9779812345678")
    expect(nameSchema.parse("Jane Doe")).toBe("Jane Doe")
  })

  it("rejects invalid values", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow()
    expect(() => phoneSchema.parse("123")).toThrow() // too short
    expect(() => nameSchema.parse("J")).toThrow() // too short
    expect(() => nameSchema.parse("Jane123")).toThrow() // invalid characters
  })
})

describe("priceSchema / stockSchema", () => {
  it("requires a positive price within range", () => {
    expect(priceSchema.parse(9.99)).toBe(9.99)
    expect(() => priceSchema.parse(0)).toThrow()
    expect(() => priceSchema.parse(-5)).toThrow()
    expect(() => priceSchema.parse(10001)).toThrow()
  })

  it("rejects a stringified price (the original 400 bug)", () => {
    expect(() => priceSchema.parse("9.99" as unknown as number)).toThrow()
  })

  it("requires a non-negative whole-number stock", () => {
    expect(stockSchema.parse(0)).toBe(0)
    expect(() => stockSchema.parse(-1)).toThrow()
    expect(() => stockSchema.parse(1.5)).toThrow()
    expect(() => stockSchema.parse(100001)).toThrow()
  })
})

describe("expiryDateSchema", () => {
  it("accepts a parseable date string, including past dates", () => {
    expect(expiryDateSchema.parse("2020-01-01")).toBe("2020-01-01")
    expect(expiryDateSchema.parse("2030-12-31")).toBe("2030-12-31")
  })

  it("is optional and rejects unparseable strings", () => {
    expect(expiryDateSchema.parse(undefined)).toBeUndefined()
    expect(() => expiryDateSchema.parse("not-a-date")).toThrow()
  })
})

describe("medicineSchema", () => {
  const base = {
    name: "Napa",
    generic_name: "Paracetamol",
    strength: "500mg",
    form: "tablet",
    unit_price: 1.5,
    cost_price: 0.9,
    stock_quantity: 10,
    minimum_stock: 5,
    expiry_date: "2027-01-01",
    prescription_required: false,
    controlled_substance: false,
  }

  it("accepts a fully-formed payload", () => {
    const result = medicineSchema.parse(base)
    expect(result.name).toBe("Napa")
    expect(result.unit_price).toBe(1.5)
  })

  it("accepts explicit null for optional text fields (brand_name, description, etc.)", () => {
    // Regression: these used to be `.optional()` without `.nullable()`, so a client
    // sending `null` (the natural JS value for "no data") got a 400.
    const result = medicineSchema.parse({
      ...base,
      brand_name: null,
      description: null,
      side_effects: null,
      storage_instructions: null,
      batch_number: null,
      barcode: null,
    })
    expect(result.brand_name).toBeNull()
    expect(result.description).toBeNull()
  })

  it("omitting optional text fields also resolves to null", () => {
    const result = medicineSchema.parse(base)
    expect(result.brand_name).toBeNull()
    expect(result.description).toBeNull()
  })

  it("preserves category_id, supplier_id, and is_taxable instead of silently stripping them", () => {
    // Regression: these were never declared on the schema, so Zod's default
    // "strip unknown keys" behavior silently dropped them on every create/update —
    // the medicine record's supplier/category link never actually persisted.
    const supplierId = "11111111-1111-1111-1111-111111111111"
    const categoryId = "22222222-2222-2222-2222-222222222222"
    const result = medicineSchema.parse({
      ...base,
      supplier_id: supplierId,
      category_id: categoryId,
      is_taxable: false,
    })
    expect(result.supplier_id).toBe(supplierId)
    expect(result.category_id).toBe(categoryId)
    expect(result.is_taxable).toBe(false)
  })

  it("accepts null supplier_id/category_id (unassigning)", () => {
    const result = medicineSchema.parse({ ...base, supplier_id: null, category_id: null })
    expect(result.supplier_id).toBeNull()
    expect(result.category_id).toBeNull()
  })

  it("rejects a non-UUID supplier_id/category_id", () => {
    expect(() => medicineSchema.parse({ ...base, supplier_id: "not-a-uuid" })).toThrow()
    expect(() => medicineSchema.parse({ ...base, category_id: "not-a-uuid" })).toThrow()
  })

  it("rejects a stringified unit_price/cost_price (the original 400 bug)", () => {
    expect(() =>
      medicineSchema.parse({ ...base, unit_price: "1.50" as unknown as number })
    ).toThrow()
    expect(() =>
      medicineSchema.parse({ ...base, cost_price: "0.90" as unknown as number })
    ).toThrow()
  })

  it("requires strength and form", () => {
    expect(() => medicineSchema.parse({ ...base, strength: "" })).toThrow()
    expect(() => medicineSchema.parse({ ...base, form: "" })).toThrow()
  })

  it("sanitizes free-text fields", () => {
    const result = medicineSchema.parse({ ...base, description: "<b>Great</b> medicine" })
    expect(result.description).toBe("bGreat/b medicine")
  })
})

describe("customerSchema", () => {
  it("accepts a minimal customer", () => {
    const result = customerSchema.parse({ first_name: "Jane", last_name: "Doe" })
    expect(result.first_name).toBe("Jane")
  })

  it("validates optional email/phone/date_of_birth when provided", () => {
    expect(() =>
      customerSchema.parse({ first_name: "Jane", last_name: "Doe", email: "bad" })
    ).toThrow()
    expect(() =>
      customerSchema.parse({ first_name: "Jane", last_name: "Doe", date_of_birth: "not-a-date" })
    ).toThrow()
  })
})

describe("prescriptionSchema", () => {
  const base = {
    customer_id: "11111111-1111-1111-1111-111111111111",
    doctor_name: "John Smith",
    issue_date: "2026-01-01",
    prescription_items: [
      { medicine_id: "22222222-2222-2222-2222-222222222222", quantity_prescribed: 2 },
    ],
  }

  it("accepts a valid prescription", () => {
    expect(prescriptionSchema.parse(base).prescription_items).toHaveLength(1)
  })

  it("requires at least one prescription item", () => {
    expect(() => prescriptionSchema.parse({ ...base, prescription_items: [] })).toThrow()
  })

  it("requires valid UUIDs for customer and medicine", () => {
    expect(() => prescriptionSchema.parse({ ...base, customer_id: "not-a-uuid" })).toThrow()
  })
})

describe("saleSchema", () => {
  const base = {
    items: [
      { medicine_id: "22222222-2222-2222-2222-222222222222", quantity: 1, unit_price: 5 },
    ],
    payments: [{ method: "cash" as const, amount: 5 }],
  }

  it("accepts a valid cash sale", () => {
    expect(saleSchema.parse(base).payments[0].method).toBe("cash")
  })

  it("requires at least one item", () => {
    expect(() => saleSchema.parse({ ...base, items: [] })).toThrow()
  })

  it("requires at least one payment", () => {
    expect(() => saleSchema.parse({ ...base, payments: [] })).toThrow()
  })

  it("rejects an unknown payment method", () => {
    expect(() =>
      saleSchema.parse({ ...base, payments: [{ method: "bitcoin" as any, amount: 5 }] })
    ).toThrow()
  })

  it("requires customer_id for credit sales", () => {
    const creditPayments = [{ method: "credit" as const, amount: 5 }]
    expect(() => saleSchema.parse({ ...base, payments: creditPayments })).toThrow()
    expect(
      saleSchema.parse({
        ...base,
        payments: creditPayments,
        customer_id: "11111111-1111-1111-1111-111111111111",
      }).payments[0].method
    ).toBe("credit")
  })
})

describe("supplierSchema", () => {
  it("accepts a minimal supplier", () => {
    expect(supplierSchema.parse({ name: "Acme Distributors" }).name).toBe("Acme Distributors")
  })

  it("normalizes a blank reconciliation_account_ref to null", () => {
    expect(
      supplierSchema.parse({ name: "Acme Distributors", reconciliation_account_ref: "   " })
        .reconciliation_account_ref
    ).toBeNull()
  })
})

describe("userSchema", () => {
  it("accepts a valid staff user", () => {
    const result = userSchema.parse({
      email: "a@b.com",
      full_name: "Jane Doe",
      role: "pharmacist",
    })
    expect(result.role).toBe("pharmacist")
  })

  it("rejects an unknown role", () => {
    expect(() =>
      userSchema.parse({ email: "a@b.com", full_name: "Jane Doe", role: "owner" as any })
    ).toThrow()
  })
})
