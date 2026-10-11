import { describe, expect, it } from "vitest"
import { licenseDueText, licensesNeedingAttention, type PharmacyLicense } from "./licenses-api"

const license = (id: string, daysLeft: number): PharmacyLicense => ({
  id,
  licenseType: "dda_pharmacy",
  label: "DDA pharmacy license",
  title: null,
  number: id,
  holderName: null,
  issuedOn: null,
  expiresOn: "2027-01-01",
  notes: null,
  daysLeft,
  status: daysLeft < 0 ? "expired" : daysLeft <= 60 ? "expiring" : "valid",
})

describe("licenses", () => {
  it("describes how long is left", () => {
    expect(licenseDueText(12)).toBe("Expires in 12 days")
    expect(licenseDueText(1)).toBe("Expires tomorrow")
    expect(licenseDueText(0)).toBe("Expires today")
    expect(licenseDueText(-1)).toBe("Expired 1 day ago")
    expect(licenseDueText(-3)).toBe("Expired 3 days ago")
  })

  it("lists expired and soon-expiring licenses, most urgent first", () => {
    const ids = licensesNeedingAttention([license("a", 90), license("b", 30), license("c", -5), license("d", 60)]).map((l) => l.id)
    expect(ids).toEqual(["c", "b", "d"])
  })
})
