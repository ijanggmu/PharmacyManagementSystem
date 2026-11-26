import { describe, expect, it } from "vitest"
import { createTenantSchema } from "./create-tenant"

const valid = {
  name: "Shree Ram Pharmacy",
  adminEmail: "owner@example.com",
  adminPassword: "Pharmacy2026",
  confirmPassword: "Pharmacy2026",
}

function fieldErrors(input: Record<string, string>) {
  const result = createTenantSchema.safeParse(input)
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) errors[String(issue.path[0])] ??= issue.message
  return errors
}

describe("createTenantSchema", () => {
  it("accepts a valid form", () => {
    expect(createTenantSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a weak password with the missing rules", () => {
    expect(fieldErrors({ ...valid, adminPassword: "password", confirmPassword: "password" }).adminPassword).toBe(
      "Password needs at least 10 characters, an uppercase letter, a number",
    )
  })

  it("rejects mismatched confirmation", () => {
    expect(fieldErrors({ ...valid, confirmPassword: "Pharmacy2027" }).confirmPassword).toBe("Passwords do not match")
  })

  it("requires a name and a valid email", () => {
    const errors = fieldErrors({ ...valid, name: " ", adminEmail: "nope" })
    expect(errors.name).toBe("Enter the pharmacy name")
    expect(errors.adminEmail).toBe("Enter a valid email, like owner@pharmacy.com")
  })
})
