import { describe, expect, it } from "vitest"
import { toConsignmentPosition, type DotnetConsignmentPositionDto } from "./api-client-consignment"

const base: DotnetConsignmentPositionDto = {
  id: "11111111-1111-1111-1111-111111111111",
  supplierId: "22222222-2222-2222-2222-222222222222",
  branchId: "33333333-3333-3333-3333-333333333333",
  medicineId: "44444444-4444-4444-4444-444444444444",
  medicineName: "Amoxicillin 250mg",
  batchId: "55555555-5555-5555-5555-555555555555",
  batchNo: "AMX-42",
  quantityReceived: 100,
  quantityRemaining: 60,
  quantitySold: 40,
  unitCostPrice: 12.5,
  settledQuantity: 15,
  amountOwed: 312.5,
  receivedDateUtc: "2026-10-01T00:00:00Z",
}

describe("toConsignmentPosition", () => {
  it("maps identifiers and batch fields to the legacy names", () => {
    const row = toConsignmentPosition(base)
    expect(row).toMatchObject({
      batch_id: base.batchId,
      medicine_id: base.medicineId,
      medicine_name: "Amoxicillin 250mg",
      batch_number: "AMX-42",
      supplier_id: base.supplierId,
      quantity_received: 100,
      quantity_remaining: 60,
      settled_quantity: 15,
      unit_cost: 12.5,
      unsettled_value: 312.5,
    })
  })

  it("derives unsettled sold quantity as sold minus settled", () => {
    expect(toConsignmentPosition(base).unsettled_sold_quantity).toBe(25)
  })

  it("leaves supplier_name empty because the .NET DTO does not carry it", () => {
    expect(toConsignmentPosition(base).supplier_name).toBe("")
  })

  it("uses an empty medicine name when the .NET value is null", () => {
    expect(toConsignmentPosition({ ...base, medicineName: null }).medicine_name).toBe("")
  })
})
