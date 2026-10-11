import { describe, expect, it } from "vitest"
import { subledgerIsCurrentOnly } from "@/lib/api/accounting-reports-api"

describe("subledgerIsCurrentOnly", () => {
  it("is false when the subledger is read as of the same moment as the GL", () => {
    expect(subledgerIsCurrentOnly({ asOfUtc: "2026-04-10T18:14:59Z", subledgerAsOfUtc: "2026-04-10T18:14:59Z" })).toBe(false)
  })

  it("is true when the subledger is today's figure but the GL is as at an earlier date", () => {
    expect(subledgerIsCurrentOnly({ asOfUtc: "2026-04-10T18:14:59Z", subledgerAsOfUtc: "2026-10-11T06:00:00Z" })).toBe(true)
  })

  it("is false for an older API that does not report the subledger moment", () => {
    expect(subledgerIsCurrentOnly({ asOfUtc: "2026-04-10T18:14:59Z" })).toBe(false)
  })
})
