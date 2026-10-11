import { describe, expect, it } from "vitest"
import { withCategoryNames, type Medicine } from "@/features/medicines/api-client"

const CATEGORY_ID = "9F1C2D3E-1111-4222-8333-444455556666"

/** Only the fields withCategoryNames reads; the rest of Medicine is irrelevant here. */
function medicine(overrides: Partial<Medicine>): Medicine {
  const base: Partial<Medicine> = { id: "m1", name: "Paracetamol", category_id: null, categories: null, suppliers: null }
  return { ...base, ...overrides } as Medicine
}

describe("withCategoryNames", () => {
  const names = new Map([[CATEGORY_ID.toLowerCase(), "Analgesics"]])

  it("fills the category name from category_id, matching ids case-insensitively", () => {
    const [m] = withCategoryNames([medicine({ category_id: CATEGORY_ID })], names)
    expect(m.categories).toEqual({ id: CATEGORY_ID, name: "Analgesics" })
  })

  it("leaves medicines without a category, or with an unknown one, unchanged", () => {
    const none = medicine({ category_id: null })
    const unknown = medicine({ category_id: "00000000-0000-0000-0000-000000000000" })
    expect(withCategoryNames([none, unknown], names)).toEqual([none, unknown])
  })
})
