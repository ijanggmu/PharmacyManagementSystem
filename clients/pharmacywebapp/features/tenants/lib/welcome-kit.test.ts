import { describe, expect, it } from "vitest"
import { planLabel, tenantSignInUrl, welcomeKitFilename, welcomeKitRows, welcomeKitText, type WelcomeKitDetails } from "./welcome-kit"

const details: WelcomeKitDetails = {
  pharmacyName: "Shree Ram Pharmacy",
  tenantCode: "shree-ram-pharmacy",
  signInUrl: "https://pharmacare.example/t/shree-ram-pharmacy/login",
  adminEmail: "owner@example.com",
  adminPassword: "Pharmacy2026",
  plan: "trial",
  validUpto: "2027-01-15T00:00:00Z",
}

describe("welcome kit", () => {
  it("builds the sign-in URL from the origin and code", () => {
    expect(tenantSignInUrl("https://pharmacare.example/", "shree-ram-pharmacy")).toBe(
      "https://pharmacare.example/t/shree-ram-pharmacy/login",
    )
  })

  it("lists every detail, password included", () => {
    const rows = welcomeKitRows(details)
    expect(rows.map((r) => r.label)).toEqual([
      "Pharmacy",
      "Pharmacy code",
      "Sign-in page",
      "Admin email",
      "Temporary password",
      "Plan",
      "Valid until",
    ])
    expect(rows.find((r) => r.label === "Valid until")?.value).toBe("January 15, 2027")
  })

  it("falls back to Trial and drops a missing validity", () => {
    const rows = welcomeKitRows({ ...details, plan: null, validUpto: null })
    expect(rows.find((r) => r.label === "Plan")?.value).toBe("Trial")
    expect(rows.some((r) => r.label === "Valid until")).toBe(false)
  })

  it("renders copyable text with the steps and privacy note", () => {
    const text = welcomeKitText(details)
    expect(text).toContain("Temporary password: Pharmacy2026")
    expect(text).toContain("1. Sign in and change this temporary password")
    expect(text).toContain("Keep this document private")
  })

  it("makes a safe file name", () => {
    expect(welcomeKitFilename("shree-ram-pharmacy")).toBe("pharmacare-welcome-shree-ram-pharmacy.pdf")
    expect(welcomeKitFilename("../x")).toBe("pharmacare-welcome-x.pdf")
  })
})

describe("planLabel", () => {
  it("turns a plan key into a label", () => {
    expect(planLabel("free")).toBe("Free")
    expect(planLabel("pro-annual")).toBe("Pro annual")
    expect(planLabel(null)).toBe("Trial")
  })
})
