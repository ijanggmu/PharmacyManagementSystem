import { describe, expect, it } from "vitest"
import { boxSummary } from "./box-unit"

describe("boxSummary", () => {
  it("reads box › strip › tablet", () => {
    expect(boxSummary(10, 10, null, "Strip", "Tablet")).toBe("1 box = 10 strips = 100 tablets")
    expect(boxSummary("10", "5", "Cartons", "strip", "Capsule")).toBe("1 carton = 5 strips = 50 capsules")
  })

  it("is null without a box or a pack to put in it", () => {
    expect(boxSummary(10, null, "Box", "Strip", "Tablet")).toBeNull()
    expect(boxSummary(10, "", null, "Strip", "Tablet")).toBeNull()
    expect(boxSummary(null, 10, null, "Strip", "Tablet")).toBeNull()
    expect(boxSummary(10, 1, null, "Strip", "Tablet")).toBeNull()
  })
})
