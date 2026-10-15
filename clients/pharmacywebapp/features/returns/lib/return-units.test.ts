import { describe, expect, it } from "vitest"
import { innerPackOf, returnUnitOptions } from "./return-units"

const boxSold = { unitsPerPack: 100, packLabel: "box", baseLabel: "tablet" }
const stripSold = { unitsPerPack: 10, packLabel: "strip", baseLabel: "tablet" }
const medicine = { units_per_pack: 10, unit_label: "Strip", form: "Tablet", packs_per_box: 10 }

describe("innerPackOf", () => {
  it("finds the strip inside a box line from the medicine's packing", () => {
    expect(innerPackOf(boxSold, medicine)).toEqual({ unitsPerPack: 10, packLabel: "strip" })
  })

  it("has none for a strip line, an uneven pack, or an unknown medicine", () => {
    expect(innerPackOf(stripSold, medicine)).toBeNull()
    expect(innerPackOf(boxSold, { ...medicine, units_per_pack: 30 })).toBeNull()
    expect(innerPackOf(boxSold, null)).toBeNull()
    expect(innerPackOf(null, medicine)).toBeNull()
  })
})

describe("returnUnitOptions", () => {
  it("offers tablets, strips and boxes for a box line", () => {
    expect(returnUnitOptions(boxSold, { unitsPerPack: 10, packLabel: "strip" }).map((o) => [o.value, o.label, o.factor])).toEqual([
      ["base", "tablets", 1],
      ["pack", "strips of 10", 10],
      ["box", "boxes of 100", 100],
    ])
  })

  it("keeps tablets and the sold pack for a strip line, and nothing for a tablet line", () => {
    expect(returnUnitOptions(stripSold, null).map((o) => o.label)).toEqual(["tablets", "strips of 10"])
    expect(returnUnitOptions(null, null)).toEqual([])
  })
})
