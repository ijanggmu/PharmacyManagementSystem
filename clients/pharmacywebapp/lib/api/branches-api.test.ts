import { describe, expect, it, vi } from "vitest"
import {
  buildCreateBranchBody,
  buildUpdateBranchBody,
  canManageBranches,
  createBranch,
  deactivateBranch,
  switchBranch,
  toBranches,
  updateBranch,
  type DotnetBranchDto,
} from "@/lib/api/branches-api"
import { DOTNET_ROOT_PERMISSIONS } from "@/lib/api/dotnet-permissions"

const input = {
  name: "  Main Street  ",
  code: " MS-01 ",
  address: "12 High St",
  phone: "",
  email: "  ",
}

type Client = Parameters<typeof createBranch>[1]

function fakeClient() {
  const client = {
    get: vi.fn(async () => ({ items: [] })),
    post: vi.fn(async () => ({}) as DotnetBranchDto),
    put: vi.fn(async () => ({}) as DotnetBranchDto),
    delete: vi.fn(async () => ({}) as DotnetBranchDto),
  }
  return { client: client as unknown as Client, spies: client }
}

describe("buildCreateBranchBody", () => {
  it("trims text and sends empty optional fields as null", () => {
    expect(buildCreateBranchBody(input)).toEqual({
      name: "Main Street",
      code: "MS-01",
      address: "12 High St",
      phone: null,
      email: null,
    })
  })
})

describe("buildUpdateBranchBody", () => {
  it("includes the route id, isActive and the same trimmed fields", () => {
    expect(buildUpdateBranchBody("b-1", { ...input, isActive: false })).toEqual({
      id: "b-1",
      name: "Main Street",
      code: "MS-01",
      address: "12 High St",
      phone: null,
      email: null,
      isActive: false,
    })
  })
})

describe("branch API calls", () => {
  it("posts the create body to /branches", async () => {
    const { client, spies } = fakeClient()
    await createBranch(input, client)
    expect(spies.post).toHaveBeenCalledWith("/branches", buildCreateBranchBody(input))
  })

  it("puts the update body to /branches/{id}", async () => {
    const { client, spies } = fakeClient()
    await updateBranch("b-1", { ...input, isActive: true }, client)
    expect(spies.put).toHaveBeenCalledWith("/branches/b-1", buildUpdateBranchBody("b-1", { ...input, isActive: true }))
  })

  it("posts the branch id to /branches/switch and maps the returned context", async () => {
    const { client, spies } = fakeClient()
    spies.post.mockResolvedValueOnce({
      branches: [{ id: "b-2", name: "Lakeside", code: "LKS", isActive: true, createdOnUtc: "2026-01-01T00:00:00Z" }],
      currentBranchId: "b-2",
    } as unknown as DotnetBranchDto)
    const context = await switchBranch("b-2", client)
    expect(spies.post).toHaveBeenCalledWith("/branches/switch", { branchId: "b-2" })
    expect(context.currentBranchId).toBe("b-2")
    expect(context.branches[0]).toMatchObject({ id: "b-2", name: "Lakeside", isDefault: true })
  })

  it("deletes /branches/{id} for deactivation", async () => {
    const { client, spies } = fakeClient()
    await deactivateBranch("b-1", client)
    expect(spies.delete).toHaveBeenCalledWith("/branches/b-1")
  })
})

describe("toBranches", () => {
  it("marks the oldest branch as default", () => {
    const items: DotnetBranchDto[] = [
      { id: "new", name: "New", code: "N", isActive: true, createdOnUtc: "2026-03-01T00:00:00Z" },
      { id: "old", name: "Old", code: "O", isActive: true, createdOnUtc: "2025-01-01T00:00:00Z" },
    ]
    const rows = toBranches(items)
    expect(rows.find((r) => r.id === "old")?.isDefault).toBe(true)
    expect(rows.find((r) => r.id === "new")?.isDefault).toBe(false)
  })
})

describe("canManageBranches", () => {
  it("requires Permissions.Branches.Manage or root", () => {
    expect(canManageBranches(["Permissions.Branches.View"])).toBe(false)
    expect(canManageBranches(["Permissions.Branches.Manage"])).toBe(true)
    expect(canManageBranches(DOTNET_ROOT_PERMISSIONS)).toBe(true)
  })
})
