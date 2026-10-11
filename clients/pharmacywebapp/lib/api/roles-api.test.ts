import { describe, expect, it, vi } from "vitest"
import {
  canCreateRoles,
  canDeleteRoles,
  canUpdateRoles,
  canViewRoles,
  deleteRole,
  getPermissionCatalog,
  getRoleWithPermissions,
  groupPermissionsByResource,
  isSystemRole,
  listRoles,
  roleErrorMessage,
  updateRolePermissions,
  upsertRole,
  type DotnetRoleDto,
  type PermissionCatalogEntry,
} from "@/lib/api/roles-api"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"

type Client = Parameters<typeof listRoles>[0]

function fakeClient() {
  const client = {
    get: vi.fn(async (_path: string): Promise<any> => ({ items: [] })),
    post: vi.fn(async (_path: string, _body?: unknown): Promise<any> => ({})),
    put: vi.fn(async (_path: string, _body?: unknown): Promise<any> => "permissions updated"),
    delete: vi.fn(async (_path: string): Promise<any> => undefined),
  }
  return { client: client as unknown as Client, spies: client }
}

describe("listRoles", () => {
  it("gets the paged roles endpoint and returns items", async () => {
    const { client, spies } = fakeClient()
    spies.get.mockResolvedValueOnce({
      items: [{ id: "r-1", name: "Manager" }],
      pageNumber: 1,
      pageSize: 200,
      totalCount: 1,
      totalPages: 1,
    })
    const roles = await listRoles(client)
    expect(spies.get).toHaveBeenCalledWith("/identity/roles?pageNumber=1&pageSize=200")
    expect(roles).toEqual([{ id: "r-1", name: "Manager" }])
  })

  it("returns an empty array when items is missing", async () => {
    const { client } = fakeClient()
    const roles = await listRoles(client)
    expect(roles).toEqual([])
  })
})

describe("getRoleWithPermissions", () => {
  it("gets /identity/{id}/permissions, not /identity/roles/{id}/permissions", async () => {
    const { client, spies } = fakeClient()
    spies.get.mockResolvedValueOnce({ id: "r-1", name: "Manager", permissions: ["Permissions.Users.View"] })
    const role = await getRoleWithPermissions("r-1", client)
    expect(spies.get).toHaveBeenCalledWith("/identity/r-1/permissions")
    expect(role.permissions).toEqual(["Permissions.Users.View"])
  })
})

describe("upsertRole", () => {
  it("creates with an empty id, trims name/description", async () => {
    const { client, spies } = fakeClient()
    await upsertRole({ name: "  Manager  ", description: "  desc  " }, client)
    expect(spies.post).toHaveBeenCalledWith("/identity/roles", { id: "", name: "Manager", description: "desc" })
  })

  it("updates with the given id", async () => {
    const { client, spies } = fakeClient()
    await upsertRole({ id: "r-1", name: "Manager" }, client)
    expect(spies.post).toHaveBeenCalledWith("/identity/roles", { id: "r-1", name: "Manager", description: "" })
  })
})

describe("updateRolePermissions", () => {
  it("puts the roleId and permissions to /identity/{id}/permissions", async () => {
    const { client, spies } = fakeClient()
    await updateRolePermissions("r-1", ["Permissions.Users.View", "Permissions.Users.Create"], client)
    expect(spies.put).toHaveBeenCalledWith("/identity/r-1/permissions", {
      roleId: "r-1",
      permissions: ["Permissions.Users.View", "Permissions.Users.Create"],
    })
  })
})

describe("deleteRole", () => {
  it("deletes /identity/roles/{id}", async () => {
    const { client, spies } = fakeClient()
    await deleteRole("r-1", client)
    expect(spies.delete).toHaveBeenCalledWith("/identity/roles/r-1")
  })
})

describe("getPermissionCatalog", () => {
  it("gets /identity/permissions/catalog", async () => {
    const { client, spies } = fakeClient()
    spies.get.mockResolvedValueOnce([])
    await getPermissionCatalog(client)
    expect(spies.get).toHaveBeenCalledWith("/identity/permissions/catalog")
  })
})

describe("groupPermissionsByResource", () => {
  it("groups by resource, sorted by resource then permission name", () => {
    const entries: PermissionCatalogEntry[] = [
      { name: "Permissions.Users.Create", description: "", resource: "Users", action: "Create", isBasic: false, isRoot: false },
      { name: "Permissions.Users.View", description: "", resource: "Users", action: "View", isBasic: true, isRoot: false },
      { name: "Permissions.Roles.View", description: "", resource: "Roles", action: "View", isBasic: true, isRoot: false },
    ]
    const groups = groupPermissionsByResource(entries)
    expect(groups.map((g) => g.resource)).toEqual(["Roles", "Users"])
    expect(groups.find((g) => g.resource === "Users")?.permissions.map((p) => p.name)).toEqual([
      "Permissions.Users.Create",
      "Permissions.Users.View",
    ])
  })
})

describe("isSystemRole", () => {
  it("flags Admin and Basic as system roles", () => {
    expect(isSystemRole("Admin")).toBe(true)
    expect(isSystemRole("Basic")).toBe(true)
    expect(isSystemRole("Manager")).toBe(false)
  })
})

describe("roleErrorMessage", () => {
  it("surfaces the server detail verbatim from a DotnetApiError", () => {
    const error = new DotnetApiError({ code: "VALIDATION_ERROR", message: "System roles cannot be modified.", status: 400 })
    expect(roleErrorMessage(error)).toBe("System roles cannot be modified.")
  })

  it("falls back for a non-API error", () => {
    expect(roleErrorMessage(new Error(""), "fallback")).toBe("fallback")
  })
})

describe("permission gates", () => {
  it("require the matching Roles permission", () => {
    expect(canViewRoles(["Permissions.Roles.View"])).toBe(true)
    expect(canViewRoles([])).toBe(false)
    expect(canCreateRoles(["Permissions.Roles.Create"])).toBe(true)
    expect(canUpdateRoles(["Permissions.Roles.Update"])).toBe(true)
    expect(canDeleteRoles(["Permissions.Roles.Delete"])).toBe(true)
  })

  it("allow root users through every gate", () => {
    expect(canViewRoles(DOTNET_ROOT_PERMISSIONS)).toBe(true)
    expect(canCreateRoles(DOTNET_ROOT_PERMISSIONS)).toBe(true)
    expect(canUpdateRoles(DOTNET_ROOT_PERMISSIONS)).toBe(true)
    expect(canDeleteRoles(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })
})
