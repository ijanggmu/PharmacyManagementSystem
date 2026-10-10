import { describe, expect, it } from "vitest"
import { splitMatches } from "./highlight-match"

describe("splitMatches", () => {
  it("returns the whole text when there is no query", () => {
    expect(splitMatches("Paracetamol", "  ")).toEqual([{ text: "Paracetamol", match: false }])
  })

  it("marks every case-insensitive match and keeps the original casing", () => {
    expect(splitMatches("Amoxicillin AMOX", "amox")).toEqual([
      { text: "Amox", match: true },
      { text: "icillin ", match: false },
      { text: "AMOX", match: true },
    ])
  })
})
