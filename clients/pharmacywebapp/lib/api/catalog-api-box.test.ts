import { describe, expect, it } from "vitest"
import {
  toDotnetCreateMedicineCommand,
  toDotnetUpdateMedicineCommand,
  toDotnetUpdateMedicineSteps,
  type DotnetMedicineDto,
} from "./catalog-api"

const current: DotnetMedicineDto = {
  id: "m1",
  name: "Amoxicillin",
  genericName: null,
  categoryId: null,
  reorderLevel: 5,
  isControlled: false,
  totalQuantityOnHand: 0,
  createdAtUtc: "2026-01-01T00:00:00Z",
  updatedAtUtc: null,
  unitPrice: 2,
  costPrice: 1,
  form: "Capsule",
  strength: "500mg",
  supplierId: null,
  barcode: null,
  description: null,
  maximumStock: null,
  prescriptionRequired: false,
  brandName: null,
  dosage: null,
  sideEffects: null,
  storageInstructions: null,
  storageTempMinC: null,
  storageTempMaxC: null,
  requiresColdChain: false,
  unitsPerPack: 10,
  unitLabel: "strip",
  packsPerBox: 10,
  boxLabel: null,
  isTaxable: true,
  supplierInvoiceNumber: null,
  vatAmount: null,
}

describe("medicine box fields", () => {
  it("sends packs per box and the box label on create", () => {
    const command = toDotnetCreateMedicineCommand({ name: "X", units_per_pack: 10, packs_per_box: "12", box_label: " Carton " })
    expect(command).toMatchObject({ unitsPerPack: 10, packsPerBox: 12, boxLabel: "Carton" })
    expect(toDotnetCreateMedicineCommand({ name: "X" })).toMatchObject({ packsPerBox: null, boxLabel: null })
  })

  it("keeps the stored box when the update omits it", () => {
    expect(toDotnetUpdateMedicineCommand(current, { name: "Amoxicillin" })).toMatchObject({
      packsPerBox: 10,
      boxLabel: null,
      clearBoxUnit: false,
    })
  })

  it("changes or clears the box on update", () => {
    expect(toDotnetUpdateMedicineCommand(current, { packs_per_box: 6, box_label: "Carton" })).toMatchObject({
      packsPerBox: 6,
      boxLabel: "Carton",
      clearBoxUnit: false,
    })
    expect(toDotnetUpdateMedicineCommand(current, { packs_per_box: null })).toMatchObject({
      packsPerBox: null,
      boxLabel: null,
      clearBoxUnit: true,
    })
    // No box to clear: nothing to send.
    expect(toDotnetUpdateMedicineCommand({ ...current, packsPerBox: null }, { packs_per_box: "" })).toMatchObject({
      packsPerBox: null,
      clearBoxUnit: false,
    })
  })

  it("removes the box with the pack size it sits on", () => {
    const steps = toDotnetUpdateMedicineSteps(current, { units_per_pack: null })
    for (const step of steps) {
      expect(step).toMatchObject({ unitsPerPack: null, packsPerBox: null, clearBoxUnit: true })
    }
  })
})
