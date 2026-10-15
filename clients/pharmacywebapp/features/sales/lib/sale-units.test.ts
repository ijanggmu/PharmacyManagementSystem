import { describe, expect, it } from "vitest"
import {
  addToCartLine,
  baseFromDisplay,
  cartQuantityNote,
  countedUnits,
  displayQuantity,
  effectiveUnit,
  hasBox,
  unitFactor,
  unitLabel,
  saleLineUnitFields,
  formatPackQuantity,
  formatStockInUnits,
  formatUnitCount,
  isWholePacks,
  packsToBase,
  pluralizeUnit,
  resolveSaleUnits,
  snapToPacks,
  soldQuantityNote,
  wholePacks,
} from "./sale-units"

const strip = { unitsPerPack: 10, packLabel: "strip", baseLabel: "tablet" }

describe("resolveSaleUnits", () => {
  it("reads a pack word in unit_label as the pack and the base unit from the form", () => {
    expect(resolveSaleUnits({ units_per_pack: 10, unit_label: "Strip", form: "Tablet" })).toEqual(strip)
    expect(resolveSaleUnits({ units_per_pack: 30, unit_label: "Boxes", form: "Capsule" })).toEqual({
      unitsPerPack: 30,
      packLabel: "box",
      baseLabel: "capsule",
    })
  })

  it("reads any other unit_label as the base unit of a generic pack", () => {
    expect(resolveSaleUnits({ units_per_pack: 15, unit_label: "Tablet", form: "Tablet" })).toEqual({
      unitsPerPack: 15,
      packLabel: "pack",
      baseLabel: "tablet",
    })
    expect(resolveSaleUnits({ units_per_pack: 5, unit_label: null, form: "Syrup" })).toEqual({
      unitsPerPack: 5,
      packLabel: "pack",
      baseLabel: "unit",
    })
  })

  it("has no pack without a pack size of at least two", () => {
    expect(resolveSaleUnits({ units_per_pack: null, unit_label: "Strip" })).toBeNull()
    expect(resolveSaleUnits({ units_per_pack: 1, unit_label: "Strip" })).toBeNull()
    expect(resolveSaleUnits({})).toBeNull()
  })
})

describe("unit math", () => {
  it("converts packs to base units and back", () => {
    expect(packsToBase(2, 10)).toBe(20)
    expect(packsToBase(2.7, 10)).toBe(20)
    expect(wholePacks(35, 10)).toBe(3)
    expect(isWholePacks(30, 10)).toBe(true)
    expect(isWholePacks(35, 10)).toBe(false)
    expect(isWholePacks(0, 10)).toBe(false)
  })

  it("snaps a line to whole packs within stock", () => {
    expect(snapToPacks(1, 10, 35)).toBe(10)
    expect(snapToPacks(17, 10, 35)).toBe(20)
    expect(snapToPacks(40, 10, 35)).toBe(30)
    expect(snapToPacks(3, 10, 8)).toBe(0)
  })
})

describe("cart lines", () => {
  it("adds base units to a base line and packs to a pack line", () => {
    expect(addToCartLine(null, 1, "base", strip)).toEqual({ quantity: 1, saleUnit: "base" })
    expect(addToCartLine({ quantity: 3, saleUnit: "base" }, 5, "base", strip)).toEqual({ quantity: 8, saleUnit: "base" })
    expect(addToCartLine(null, 1, "pack", strip)).toEqual({ quantity: 10, saleUnit: "pack" })
    expect(addToCartLine({ quantity: 20, saleUnit: "pack" }, 1, "base", strip)).toEqual({ quantity: 30, saleUnit: "pack" })
  })

  it("rounds loose units up to whole packs when a base line gets a pack", () => {
    expect(addToCartLine({ quantity: 3, saleUnit: "base" }, 1, "pack", strip)).toEqual({ quantity: 20, saleUnit: "pack" })
  })

  it("stays in base units for a medicine without a pack", () => {
    expect(addToCartLine({ quantity: 3 }, 1, "pack", null)).toEqual({ quantity: 4, saleUnit: "base" })
  })

  it("shows and reads quantities in the line's unit", () => {
    const line = { quantity: 20, saleUnit: "pack" as const, packUnits: strip }
    expect(displayQuantity(line)).toBe(2)
    expect(baseFromDisplay(line, 3)).toBe(30)
    expect(displayQuantity({ quantity: 7, saleUnit: "base" as const, packUnits: strip })).toBe(7)
    expect(baseFromDisplay({ saleUnit: "base" as const, packUnits: strip }, 7)).toBe(7)
  })

  it("sends the pack count only for whole-pack lines", () => {
    expect(saleLineUnitFields({ quantity: 20, saleUnit: "pack", packUnits: strip })).toEqual({ sale_unit: "pack", pack_count: 2 })
    expect(saleLineUnitFields({ quantity: 25, saleUnit: "pack", packUnits: strip })).toEqual({})
    expect(saleLineUnitFields({ quantity: 20, saleUnit: "base", packUnits: strip })).toEqual({})
  })
})

describe("formatting", () => {
  it("pluralizes unit labels", () => {
    expect(pluralizeUnit("tablet", 2)).toBe("tablets")
    expect(pluralizeUnit("box", 3)).toBe("boxes")
    expect(pluralizeUnit("strip", 1)).toBe("strip")
    expect(formatUnitCount(1, "strip")).toBe("1 strip")
  })

  it("shows stock in both units", () => {
    expect(formatStockInUnits(35, strip)).toBe("35 tablets = 3 strips + 5")
    expect(formatStockInUnits(30, strip)).toBe("30 tablets = 3 strips")
    expect(formatStockInUnits(7, strip)).toBe("7 tablets")
    expect(formatStockInUnits(7, null)).toBe("7 units")
  })

  it("describes a pack sale for the invoice", () => {
    expect(formatPackQuantity(20, strip)).toBe("2 strips (20 tablets)")
    expect(formatPackQuantity(15, strip)).toBe("1 strip + 5 tablets (15 tablets)")
    expect(formatPackQuantity(5, strip)).toBe("5 tablets")
  })

  it("notes recorded and cart lines only when sold in packs", () => {
    expect(
      soldQuantityNote({ quantity: 20, sold_units_per_pack: 10, sold_pack_label: "strip", base_unit_label: "tablet" }),
    ).toBe("2 strips (20 tablets)")
    expect(soldQuantityNote({ quantity: 20 })).toBeNull()
    expect(cartQuantityNote({ quantity: 20, saleUnit: "pack", packUnits: strip })).toBe("2 strips (20 tablets)")
    expect(cartQuantityNote({ quantity: 20, saleUnit: "base", packUnits: strip })).toBeNull()
  })
})

describe("boxes (box › strip › tablet)", () => {
  const boxed = { ...strip, packsPerBox: 10, boxLabel: "box", unitsPerBox: 100 }

  it("resolves a box only on top of a pack, labelled 'box' by default", () => {
    expect(resolveSaleUnits({ units_per_pack: 10, unit_label: "Strip", form: "Tablet", packs_per_box: 10 })).toEqual(boxed)
    expect(resolveSaleUnits({ units_per_pack: 10, unit_label: "Strip", form: "Tablet", packs_per_box: 5, box_label: " Cartons " }))
      .toEqual({ ...strip, packsPerBox: 5, boxLabel: "carton", unitsPerBox: 50 })
    expect(resolveSaleUnits({ units_per_pack: null, packs_per_box: 10 })).toBeNull()
    expect(resolveSaleUnits({ units_per_pack: 10, unit_label: "Strip", form: "Tablet", packs_per_box: 1 })).toEqual(strip)
    expect(resolveSaleUnits({ units_per_pack: 10, unit_label: "Strip", form: "Tablet", packs_per_box: null })).toEqual(strip)
  })

  it("knows each unit's size and label", () => {
    expect(unitFactor("box", boxed)).toBe(100)
    expect(unitFactor("pack", boxed)).toBe(10)
    expect(unitFactor("base", boxed)).toBe(1)
    expect(unitFactor("box", strip)).toBe(10) // no box: falls back to packs
    expect(unitFactor("pack", null)).toBe(1)
    expect(unitLabel("box", boxed)).toBe("box")
    expect(unitLabel("pack", boxed)).toBe("strip")
    expect(unitLabel("base", boxed)).toBe("tablet")
    expect(hasBox(boxed)).toBe(true)
    expect(hasBox(strip)).toBe(false)
    expect(effectiveUnit("box", strip)).toBe("pack")
    expect(effectiveUnit("box", null)).toBe("base")
    expect(countedUnits("box", boxed)).toEqual({ unitsPerPack: 100, packLabel: "box", baseLabel: "tablet" })
    expect(countedUnits("pack", boxed)).toEqual(strip)
    expect(countedUnits("base", boxed)).toBeNull()
  })

  it("adds boxes to the cart in base units", () => {
    expect(addToCartLine(null, 1, "box", boxed)).toEqual({ quantity: 100, saleUnit: "box" })
    expect(addToCartLine({ quantity: 100, saleUnit: "box" }, 1, "box", boxed)).toEqual({ quantity: 200, saleUnit: "box" })
    expect(addToCartLine({ quantity: 100, saleUnit: "box" }, 1, "base", boxed)).toEqual({ quantity: 200, saleUnit: "box" })
    // A base line rounds up to whole boxes.
    expect(addToCartLine({ quantity: 5, saleUnit: "base" }, 1, "box", boxed)).toEqual({ quantity: 200, saleUnit: "box" })
    // Packs and boxes mix as packs.
    expect(addToCartLine({ quantity: 20, saleUnit: "pack" }, 1, "box", boxed)).toEqual({ quantity: 120, saleUnit: "pack" })
    expect(addToCartLine({ quantity: 100, saleUnit: "box" }, 1, "pack", boxed)).toEqual({ quantity: 110, saleUnit: "pack" })
    // No box on the medicine: a box add is a pack add.
    expect(addToCartLine(null, 1, "box", strip)).toEqual({ quantity: 10, saleUnit: "pack" })
  })

  it("shows, reads and sends box lines in boxes", () => {
    const line = { quantity: 200, saleUnit: "box" as const, packUnits: boxed }
    expect(displayQuantity(line)).toBe(2)
    expect(baseFromDisplay(line, 3)).toBe(300)
    expect(saleLineUnitFields(line)).toEqual({ sale_unit: "box", pack_count: 2 })
    expect(saleLineUnitFields({ quantity: 150, saleUnit: "box", packUnits: boxed })).toEqual({})
    expect(saleLineUnitFields({ quantity: 20, saleUnit: "box", packUnits: strip })).toEqual({ sale_unit: "pack", pack_count: 2 })
    expect(saleLineUnitFields({ quantity: 120, saleUnit: "pack", packUnits: boxed })).toEqual({ sale_unit: "pack", pack_count: 12 })
  })

  it("shows stock in boxes, strips and tablets", () => {
    expect(formatStockInUnits(345, boxed)).toBe("345 tablets = 3 boxes 4 strips + 5")
    expect(formatStockInUnits(300, boxed)).toBe("300 tablets = 3 boxes")
    expect(formatStockInUnits(100, boxed)).toBe("100 tablets = 1 box")
    expect(formatStockInUnits(45, boxed)).toBe("45 tablets = 4 strips + 5")
    expect(formatStockInUnits(7, boxed)).toBe("7 tablets")
  })

  it("notes a box cart line and a recorded box line the same way", () => {
    expect(cartQuantityNote({ quantity: 200, saleUnit: "box", packUnits: boxed })).toBe("2 boxes (200 tablets)")
    expect(
      soldQuantityNote({ quantity: 200, sold_units_per_pack: 100, sold_pack_label: "box", base_unit_label: "tablet" }),
    ).toBe("2 boxes (200 tablets)")
  })
})
