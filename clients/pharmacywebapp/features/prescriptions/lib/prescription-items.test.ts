import { describe, expect, it } from "vitest"
import { hasDuplicateMedicines } from "./prescription-items"

describe("hasDuplicateMedicines", () => {
  it("flags a medicine on two lines", () => {
    expect(hasDuplicateMedicines([{ medicine_id: "m1" }, { medicine_id: "m2" }, { medicine_id: "m1" }])).toBe(true)
  })
  it("ignores blank lines and distinct medicines", () => {
    expect(hasDuplicateMedicines([{ medicine_id: "m1" }, { medicine_id: "" }, { medicine_id: "" }, { medicine_id: "m2" }])).toBe(false)
  })
})
