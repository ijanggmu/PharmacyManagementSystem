import { describe, expect, it } from "vitest"
import {
  INITIAL_DATA,
  PASSWORD_MIN_LENGTH,
  passwordChecks,
  passwordStrength,
  provisioningPhase,
  provisioningStepLabel,
  slugify,
  validateAll,
  validateStep,
  type GetStartedData,
} from "@/lib/onboarding/get-started"

const valid: GetStartedData = {
  adminFirstName: "Asha",
  adminLastName: "Rai",
  adminEmail: "owner@sunrise.com",
  adminPassword: "Sunrise2026",
  adminConfirmPassword: "Sunrise2026",
  pharmacyName: "Sunrise Pharmacy",
  slug: "sunrise-pharmacy",
  phoneNumber: "",
}

describe("password policy", () => {
  it("matches the server policy: 10+ characters with upper, lower and a digit", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10)
    expect(passwordChecks("Sunrise2026").every((c) => c.met)).toBe(true)
    expect(passwordChecks("sunrise2026").find((c) => c.id === "upper")?.met).toBe(false)
    expect(passwordChecks("Short1A").find((c) => c.id === "length")?.met).toBe(false)
  })

  it("rates strength", () => {
    expect(passwordStrength("").score).toBe(0)
    expect(passwordStrength("abc").score).toBeLessThanOrEqual(2)
    expect(passwordStrength("Sunrise2026").label).toBe("Good")
    expect(passwordStrength("Sunrise-2026-pharmacy!").label).toBe("Strong")
  })
})

describe("validateStep", () => {
  it("accepts a valid account step", () => {
    expect(validateStep("account", valid, false)).toEqual({})
  })

  it("rejects an 8-character password the server would reject", () => {
    const errors = validateStep("account", { ...valid, adminPassword: "Pass1234", adminConfirmPassword: "Pass1234" }, false)
    expect(errors.adminPassword).toMatch(/10 characters/)
  })

  it("rejects mismatched passwords on the confirm field", () => {
    const errors = validateStep("account", { ...valid, adminConfirmPassword: "Sunrise2027" }, false)
    expect(errors.adminConfirmPassword).toBe("Passwords do not match.")
  })

  it("doesn't require a password for a Google sign-up", () => {
    expect(validateStep("account", { ...valid, adminPassword: "", adminConfirmPassword: "" }, true)).toEqual({})
  })

  it("validates the pharmacy code like the server", () => {
    expect(validateStep("pharmacy", { ...valid, slug: "admin" }, false).slug).toMatch(/reserved/)
    expect(validateStep("pharmacy", { ...valid, slug: "Bad Code" }, false).slug).toMatch(/lowercase/)
    expect(validateStep("pharmacy", { ...valid, slug: "-start" }, false).slug).toBeDefined()
    expect(validateStep("pharmacy", valid, false)).toEqual({})
  })

  it("validates the optional phone number", () => {
    expect(validateStep("pharmacy", { ...valid, phoneNumber: "+977 9800000000" }, false)).toEqual({})
    expect(validateStep("pharmacy", { ...valid, phoneNumber: "12" }, false).phoneNumber).toBeDefined()
  })
})

describe("validateAll", () => {
  it("points at the first step with an error", () => {
    expect(validateAll(INITIAL_DATA, false).firstInvalidStep).toBe("account")
    expect(validateAll({ ...valid, pharmacyName: "" }, false).firstInvalidStep).toBe("pharmacy")
    expect(validateAll(valid, false).firstInvalidStep).toBeNull()
  })
})

describe("slugify", () => {
  it("turns a pharmacy name into a code", () => {
    expect(slugify("Sunrise Pharmacy & Clinic")).toBe("sunrise-pharmacy-clinic")
    expect(slugify("  --Hello   World--  ")).toBe("hello-world")
  })
})

describe("provisioning", () => {
  it("maps statuses and step names", () => {
    expect(provisioningPhase("Completed")).toBe("completed")
    expect(provisioningPhase("Failed")).toBe("failed")
    expect(provisioningPhase("Running")).toBe("running")
    expect(provisioningPhase(null)).toBe("pending")
    expect(provisioningStepLabel("Seeding")).toMatch(/admin account/)
    expect(provisioningStepLabel("SomethingNew")).toBe("Something New")
  })
})
