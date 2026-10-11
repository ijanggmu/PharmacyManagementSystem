import { describe, expect, it } from "vitest"
import {
  canUseDotnetNarcoticRegister,
  toNarcoticRegisterRow,
  type DotnetNarcoticRegisterRowDto,
} from "@/lib/api/reports-api"

const dto: DotnetNarcoticRegisterRowDto = {
  saleId: "3f2a9c1e-1111-4222-8333-444455556666",
  saleDateUtc: "2026-10-05T06:00:00Z",
  customerId: "aaaaaaaa-1111-4222-8333-444455556666",
  customerName: "Ram Bahadur Shrestha",
  prescriptionId: "bbbbbbbb-1111-4222-8333-444455556666",
  doctorName: "Dr. Sita Gurung",
  saleItemId: "cccccccc-1111-4222-8333-444455556666",
  medicineId: "dddddddd-1111-4222-8333-444455556666",
  medicineName: "Tramadol 50mg",
  genericName: "Tramadol",
  quantity: 10,
  unitPrice: 12.5,
  lineTotal: 125,
}

describe("toNarcoticRegisterRow", () => {
  it("maps a .NET dispensing line to the legacy register row", () => {
    expect(toNarcoticRegisterRow(dto)).toEqual({
      sale_date: "2026-10-05T06:00:00Z",
      sale_number: null,
      invoice_number: null,
      first_name: "Ram",
      last_name: "Bahadur Shrestha",
      date_of_birth: null,
      prescription_number: null,
      doctor_name: "Dr. Sita Gurung",
      doctor_license: null,
      medicine_name: "Tramadol 50mg",
      strength: null,
      form: null,
      quantity: 10,
      unit_price: 12.5,
      line_total: 125,
      branch_id: null,
    })
    expect(toNarcoticRegisterRow({ ...dto, branchId: "b-2" }).branch_id).toBe("b-2")
  })

  it("leaves the customer name null for a walk-in dispensing", () => {
    const row = toNarcoticRegisterRow({ ...dto, customerId: null, customerName: null, doctorName: null })
    expect(row.first_name).toBeNull()
    expect(row.last_name).toBeNull()
    expect(row.doctor_name).toBeNull()
  })
})

describe("canUseDotnetNarcoticRegister", () => {
  it("serves the period-only request from .NET", () => {
    expect(canUseDotnetNarcoticRegister({ periodStart: "2026-10-01", periodEnd: "2026-10-06" })).toBe(true)
  })

  it("sends medicine, doctor and schedule filters to .NET", () => {
    const base = { periodStart: "2026-10-01", periodEnd: "2026-10-06" }
    expect(canUseDotnetNarcoticRegister({ ...base, medicineName: "Tramadol" })).toBe(true)
    expect(canUseDotnetNarcoticRegister({ ...base, doctorName: "Gurung" })).toBe(true)
    expect(canUseDotnetNarcoticRegister({ ...base, schedule: "II" })).toBe(true)
  })

  it("treats empty filter strings as no filter", () => {
    expect(canUseDotnetNarcoticRegister({ periodStart: "a", periodEnd: "b", medicineName: "", doctorName: "" })).toBe(true)
  })
})
