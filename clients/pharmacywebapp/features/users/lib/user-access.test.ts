import { describe, expect, it } from "vitest"
import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"
import {
  USERS_CREATE_PERMISSION,
  USERS_DELETE_PERMISSION,
  USERS_UPDATE_PERMISSION,
  canAddUsers,
  canChangeUsers,
  canDeleteUsers,
} from "./user-access"

// The manager can see staff (Users.View) but not add, edit or switch them off — the API answers 403.
const managerLike = ["Permissions.Users.View", "Permissions.Roles.View"]

describe("canAddUsers", () => {
  it("follows the API gate on adding staff (Users.Create)", () => {
    expect(canAddUsers([USERS_CREATE_PERMISSION])).toBe(true)
    expect(canAddUsers(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })

  it("is false for someone who can only see the staff list", () => {
    expect(canAddUsers(managerLike)).toBe(false)
  })
})

describe("canChangeUsers", () => {
  it("follows the API gate on editing and (de)activating staff (Users.Update)", () => {
    expect(canChangeUsers([USERS_UPDATE_PERMISSION])).toBe(true)
    expect(canChangeUsers(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })

  it("is false for someone who can only see the staff list", () => {
    expect(canChangeUsers(managerLike)).toBe(false)
  })
})

describe("canDeleteUsers", () => {
  it("follows the API gate on deleting staff (Users.Delete)", () => {
    expect(canDeleteUsers([USERS_DELETE_PERMISSION])).toBe(true)
    expect(canDeleteUsers(DOTNET_ROOT_PERMISSIONS)).toBe(true)
    expect(canDeleteUsers([USERS_UPDATE_PERMISSION])).toBe(false)
  })
})
