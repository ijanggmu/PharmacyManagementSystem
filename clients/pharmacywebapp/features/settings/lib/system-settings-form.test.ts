import { describe, expect, it } from "vitest"
import {
  isFormDirty,
  parseSystemSection,
  parseVatRateInput,
  systemSectionHref,
  vatRateToInput,
  type SystemSettingsForm,
} from "./system-settings-form"

const loaded: SystemSettingsForm = {
  pharmacyName: "City Pharmacy",
  pharmacyAddress: "",
  pharmacyPhone: "",
  pharmacyEmail: "",
  vatRate: "13",
  lowStockThreshold: "10",
  autoReorderEnabled: false,
  backupFrequency: "manual",
  receiptFooter: "Thank you",
  invoicePaper: "thermal-80",
}

describe("parseSystemSection", () => {
  it("accepts known sections", () => {
    expect(parseSystemSection("tax")).toBe("tax")
    expect(parseSystemSection("logs")).toBe("logs")
  })

  it("falls back to general for missing or unknown values", () => {
    expect(parseSystemSection(null)).toBe("general")
    expect(parseSystemSection(undefined)).toBe("general")
    expect(parseSystemSection("nope")).toBe("general")
  })
})

describe("systemSectionHref", () => {
  it("pins tab=system and sets the section, keeping other params", () => {
    expect(systemSectionHref("/dashboard/settings", "tab=users&x=1", "tax")).toBe(
      "/dashboard/settings?tab=system&x=1&section=tax",
    )
    expect(systemSectionHref("/dashboard/settings", new URLSearchParams("section=general"), "data")).toBe(
      "/dashboard/settings?section=data&tab=system",
    )
  })
})

describe("isFormDirty", () => {
  it("is clean when nothing changed", () => {
    expect(isFormDirty({ ...loaded }, loaded)).toBe(false)
  })

  it("is dirty when any field changed", () => {
    expect(isFormDirty({ ...loaded, vatRate: "13.5" }, loaded)).toBe(true)
    expect(isFormDirty({ ...loaded, autoReorderEnabled: true }, loaded)).toBe(true)
  })
})

describe("VAT rate input", () => {
  it("formats a saved percent without trailing zeros", () => {
    expect(vatRateToInput(13)).toBe("13")
    expect(vatRateToInput(13.5)).toBe("13.5")
    expect(vatRateToInput(0)).toBe("0")
  })

  it("parses text, giving NaN for blank or non-numeric input", () => {
    expect(parseVatRateInput(" 13.25 ")).toBe(13.25)
    expect(parseVatRateInput("")).toBeNaN()
    expect(parseVatRateInput("abc")).toBeNaN()
  })
})
