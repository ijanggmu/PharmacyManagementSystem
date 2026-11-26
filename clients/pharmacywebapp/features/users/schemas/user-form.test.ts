import { describe, expect, it } from "vitest"
import { addUserSchema, editUserSchema, fieldErrorsOf, setPasswordSchema } from "./user-form"

const validAdd = {
  fullName: "Sita Sharma",
  email: "sita@example.com",
  phone: "",
  roles: ["Pharmacist", "Cashier"],
  branchId: "b1",
  password: "Pharmacy2026",
}

describe("user forms", () => {
  it("accepts a valid new user with several roles", () => {
    expect(fieldErrorsOf(addUserSchema, validAdd)).toEqual({})
  })

  it("needs at least one role, a branch and a policy-compliant password", () => {
    const errors = fieldErrorsOf(addUserSchema, { ...validAdd, roles: [], branchId: "", password: "short" })
    expect(errors.roles).toBe("Choose at least one role")
    expect(errors.branchId).toBe("Choose a branch")
    expect(errors.password).toBe("Password needs at least 10 characters, an uppercase letter, a number")
  })

  it("checks email and phone shape", () => {
    const errors = fieldErrorsOf(addUserSchema, { ...validAdd, email: "sita", phone: "12" })
    expect(errors.email).toBe("Enter a valid email, like name@pharmacy.com")
    expect(errors.phone).toBe("Enter a valid phone number, like 98XXXXXXXX")
  })

  it("accepts a Nepali mobile number", () => {
    expect(fieldErrorsOf(addUserSchema, { ...validAdd, phone: "+977 9812345678" }).phone).toBeUndefined()
  })

  it("edit needs a name and a role", () => {
    const errors = fieldErrorsOf(editUserSchema, { fullName: " ", phone: "", roles: [], branchId: "" })
    expect(errors.fullName).toBe("Enter the person's full name")
    expect(errors.roles).toBe("Choose at least one role")
  })

  it("set password needs matching, policy-compliant passwords", () => {
    expect(fieldErrorsOf(setPasswordSchema, { password: "Pharmacy2026", confirmPassword: "Pharmacy2026" })).toEqual({})
    expect(fieldErrorsOf(setPasswordSchema, { password: "Pharmacy2026", confirmPassword: "x" }).confirmPassword).toBe(
      "Passwords do not match",
    )
  })
})
