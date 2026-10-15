import { describe, expect, it } from "vitest"
import { validateMedicineEditForm, validateMedicineForm } from "./medicine-form-validation"

const valid = {
  name: "Cetamol",
  generic_name: "Paracetamol",
  form: "Tablet",
  strength: "500mg",
  unit_price: "2",
  cost_price: "1.2",
  stock_quantity: 10,
  minimum_stock: 5,
  maximum_stock: 100,
  expiry_date: "2028-01-31",
}

describe("validateMedicineEditForm", () => {
  it("doesn't ask for stock or expiry, which are managed per batch", () => {
    const { stock_quantity: _s, expiry_date: _e, ...withoutStock } = valid
    expect(validateMedicineForm(withoutStock)).toHaveProperty("expiry_date")
    expect(validateMedicineEditForm(withoutStock)).toEqual({})
  })

  it("still checks the medicine's own fields", () => {
    expect(validateMedicineEditForm({ ...valid, unit_price: "1", cost_price: "2" })).toHaveProperty("unit_price")
    expect(validateMedicineEditForm({ ...valid, name: "" })).toHaveProperty("name")
  })
})

describe("box size", () => {
  it("takes a whole box of at least 2 packs, only with a pack size", () => {
    expect(validateMedicineForm({ ...valid, units_per_pack: "10", packs_per_box: "10" })).toEqual({})
    expect(validateMedicineForm({ ...valid, units_per_pack: 10, packs_per_box: 10 })).toEqual({})
    expect(validateMedicineForm({ ...valid, units_per_pack: "", packs_per_box: "" })).toEqual({})
    expect(validateMedicineForm({ ...valid, units_per_pack: "10", packs_per_box: "1" })).toHaveProperty("packs_per_box")
    expect(validateMedicineForm({ ...valid, units_per_pack: "10", packs_per_box: "2.5" })).toHaveProperty("packs_per_box")
    expect(validateMedicineForm({ ...valid, units_per_pack: "", packs_per_box: "10" })).toHaveProperty("packs_per_box")
    expect(validateMedicineForm({ ...valid, units_per_pack: "10", packs_per_box: "10", box_label: "x".repeat(51) })).toHaveProperty("box_label")
  })
})
