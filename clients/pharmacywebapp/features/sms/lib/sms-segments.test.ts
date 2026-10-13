import { describe, expect, it } from "vitest"
import { countSms, describeSms, isGsm } from "./sms-segments"

describe("countSms (GSM)", () => {
  it.each([
    [0, 0],
    [1, 1],
    [160, 1],
    [161, 2],
    [306, 2],
    [307, 3],
  ])("%i characters → %i SMS", (length, segments) => {
    const info = countSms("a".repeat(length))
    expect(info.encoding).toBe("GSM")
    expect(info.length).toBe(length)
    expect(info.segments).toBe(segments)
  })

  it("counts extension characters twice", () => {
    expect(countSms("{}[]€").length).toBe(10)
    expect(countSms("a".repeat(159) + "€").segments).toBe(2)
  })

  it("reports what is left in the current part", () => {
    expect(countSms("hello").remaining).toBe(155)
    expect(countSms("a".repeat(200)).remaining).toBe(306 - 200)
  })
})

describe("countSms (Unicode)", () => {
  it.each([
    [70, 1],
    [71, 2],
    [134, 2],
    [135, 3],
  ])("%i Nepali characters → %i SMS", (length, segments) => {
    const info = countSms("क".repeat(length))
    expect(info.encoding).toBe("Unicode")
    expect(info.segments).toBe(segments)
  })

  it("one Devanagari letter makes the whole message Unicode", () => {
    expect(isGsm("Namaste")).toBe(true)
    expect(isGsm("Namaste न")).toBe(false)
    expect(countSms("a".repeat(70) + "न").segments).toBe(2)
  })
})

describe("describeSms", () => {
  it("shows the size against the single-SMS limit, then the parts", () => {
    expect(describeSms(countSms("hello"))).toBe("5 / 160 · 1 SMS")
    expect(describeSms(countSms("a".repeat(200)))).toBe("200 chars · 2 SMS")
    expect(describeSms(countSms("नमस्ते"))).toBe("6 / 70 · 1 SMS (Unicode)")
  })
})
