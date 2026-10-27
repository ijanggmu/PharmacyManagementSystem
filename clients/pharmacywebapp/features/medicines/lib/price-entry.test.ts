import { describe, expect, it } from "vitest"
import {
  availablePriceBases,
  formUnits,
  parsePriceBasis,
  parsePriceCurrency,
  priceBasisLabel,
  priceIsConverted,
  toBaseUnitPrice,
} from "./price-entry"

const strip10 = formUnits({ units_per_pack: "10", unit_label: "Strip", form: "tablet" })
const box10x10 = formUnits({ units_per_pack: "10", unit_label: "strip", packs_per_box: "10", form: "tablet" })

describe("toBaseUnitPrice", () => {
  it("keeps a per-unit NPR price as typed", () => {
    expect(toBaseUnitPrice("2.5", { basis: "base", currency: "NPR" }, strip10, "selling")).toBe(2.5)
  })

  it("spreads a strip or box price over its tablets", () => {
    expect(toBaseUnitPrice("25", { basis: "pack", currency: "NPR" }, strip10, "selling")).toBe(2.5)
    expect(toBaseUnitPrice("900", { basis: "box", currency: "NPR" }, box10x10, "cost")).toBe(9)
  })

  it("converts INR at the 1.6 peg", () => {
    expect(toBaseUnitPrice("100", { basis: "base", currency: "INR" }, null, "selling")).toBe(160)
    expect(toBaseUnitPrice("30", { basis: "pack", currency: "INR" }, strip10, "cost")).toBe(4.8)
  })

  it("rounds selling to paisa but keeps cost to 4 decimals", () => {
    const strip3 = formUnits({ units_per_pack: 3, unit_label: "strip" })
    expect(toBaseUnitPrice("25", { basis: "pack", currency: "NPR" }, strip3, "selling")).toBe(8.33)
    expect(toBaseUnitPrice("25", { basis: "pack", currency: "NPR" }, strip3, "cost")).toBe(8.3333)
  })

  it("falls back to per unit when the pack size is gone, and is null for a non-number", () => {
    expect(toBaseUnitPrice("25", { basis: "box", currency: "NPR" }, null, "selling")).toBe(25)
    expect(toBaseUnitPrice("", { basis: "base", currency: "NPR" }, null, "selling")).toBeNull()
  })
})

describe("price bases", () => {
  it("offers pack and box only when set", () => {
    expect(availablePriceBases(null)).toEqual(["base"])
    expect(availablePriceBases(strip10)).toEqual(["base", "pack"])
    expect(availablePriceBases(box10x10)).toEqual(["base", "pack", "box"])
    expect(priceBasisLabel("pack", strip10)).toBe("strip")
    expect(priceBasisLabel("base", strip10)).toBe("tablet")
  })

  it("flags entries that are saved converted", () => {
    expect(priceIsConverted({ basis: "base", currency: "NPR" }, strip10)).toBe(false)
    expect(priceIsConverted({ basis: "pack", currency: "NPR" }, strip10)).toBe(true)
    expect(priceIsConverted({ basis: "pack", currency: "NPR" }, null)).toBe(false)
    expect(priceIsConverted({ basis: "base", currency: "INR" }, null)).toBe(true)
  })
})

describe("CSV cells", () => {
  it("reads currency and basis, defaulting to NPR per unit", () => {
    expect(parsePriceCurrency("INR")).toBe("INR")
    expect(parsePriceCurrency(" ₹ ")).toBe("INR")
    expect(parsePriceCurrency("")).toBe("NPR")
    expect(parsePriceBasis("Strip")).toBe("pack")
    expect(parsePriceBasis("box")).toBe("box")
    expect(parsePriceBasis(undefined)).toBe("base")
  })
})
