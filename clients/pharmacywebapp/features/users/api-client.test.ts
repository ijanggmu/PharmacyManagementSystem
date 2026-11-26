import { describe, expect, it } from "vitest"
import { roleAssignment, toUser } from "./api-client"
import { jobRoleNames, jobRolesSet } from "@/lib/api/dashboard-dotnet"

const rows = [
  { roleId: "1", roleName: "Admin", enabled: false },
  { roleId: "2", roleName: "Basic", enabled: true },
  { roleId: "3", roleName: "Pharmacist", enabled: true },
  { roleId: "4", roleName: "Cashier", enabled: false },
]

describe("multiple roles", () => {
  it("lists every job role but Basic", () => {
    expect(jobRoleNames([...rows.slice(0, 3), { roleId: "4", roleName: "Cashier", enabled: true }])).toEqual([
      "Pharmacist",
      "Cashier",
    ])
  })

  it("always keeps Basic and drops duplicates", () => {
    expect(jobRolesSet(["Pharmacist", "pharmacist", "Cashier"])).toEqual(["Pharmacist", "Cashier", "Basic"])
    expect(jobRolesSet([])).toEqual(["Basic"])
  })

  it("enables exactly the chosen roles plus Basic for AssignUserRoles", () => {
    expect(roleAssignment(rows, ["cashier", "Pharmacist"]).map((r) => [r.roleName, r.enabled])).toEqual([
      ["Admin", false],
      ["Basic", true],
      ["Pharmacist", true],
      ["Cashier", true],
    ])
  })

  it("maps roles and deletion onto the UI user", () => {
    const user = toUser({ id: "u1", firstName: "Sita", email: "s@x.com", deletedOnUtc: "2026-11-26T00:00:00Z" }, rows)
    expect(user.roles).toEqual(["Pharmacist"])
    expect(user.role).toBe("Pharmacist")
    expect(user.deleted_at).toBe("2026-11-26T00:00:00Z")
  })
})
