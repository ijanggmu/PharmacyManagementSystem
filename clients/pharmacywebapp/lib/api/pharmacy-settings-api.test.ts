import { describe, expect, it } from "vitest"
import {
  buildVatRateUpdateBody,
  pharmacySettingsSchema,
  validateVatRatePercent,
  type PharmacySettings,
} from "@/lib/api/pharmacy-settings-api"

const dto = {
  id: "0190a000-0000-7000-8000-000000000001",
  businessName: "City Pharmacy",
  businessAddress: null,
  businessPhone: "01-4000000",
  businessEmail: null,
  currencyCode: "NPR",
  vatRatePercent: 13,
  invoiceNumberPrefix: "INV",
  nextInvoiceSequence: 42,
  updatedAtUtc: null,
}

describe("pharmacySettingsSchema", () => {
  it("parses the .NET PharmacySettingsDto", () => {
    const parsed = pharmacySettingsSchema.parse(dto)
    expect(parsed.vatRatePercent).toBe(13)
    expect(parsed.businessAddress).toBeNull()
  })
})

describe("buildVatRateUpdateBody", () => {
  it("keeps every other field and replaces only the VAT rate", () => {
    const current: PharmacySettings = pharmacySettingsSchema.parse(dto)
    expect(buildVatRateUpdateBody(current, 13.5)).toEqual({
      businessName: "City Pharmacy",
      businessAddress: null,
      businessPhone: "01-4000000",
      businessEmail: null,
      currencyCode: "NPR",
      vatRatePercent: 13.5,
      invoiceNumberPrefix: "INV",
    })
  })
})

describe("validateVatRatePercent", () => {
  it("accepts 0-100 with up to 2 decimals", () => {
    expect(validateVatRatePercent(0)).toBeNull()
    expect(validateVatRatePercent(13)).toBeNull()
    expect(validateVatRatePercent(13.25)).toBeNull()
    expect(validateVatRatePercent(100)).toBeNull()
  })

  it("rejects out-of-range, non-numeric and over-precise rates", () => {
    expect(validateVatRatePercent(-1)).not.toBeNull()
    expect(validateVatRatePercent(100.01)).not.toBeNull()
    expect(validateVatRatePercent(Number.NaN)).not.toBeNull()
    expect(validateVatRatePercent(13.125)).not.toBeNull()
  })
})
