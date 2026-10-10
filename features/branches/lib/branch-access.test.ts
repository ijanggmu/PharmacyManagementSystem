import { describe, expect, it } from "vitest"
import { branchFilterChoices, effectiveBranchFilter, resolveOwnBranchId } from "@/features/branches/lib/branch-access"
import type { Branch } from "@/lib/api/branches-api"

function branch(id: string, overrides: Partial<Branch> = {}): Branch {
  return {
    id,
    name: `Branch ${id}`,
    code: id.toUpperCase(),
    isActive: true,
    address: null,
    phone: null,
    email: null,
    createdOnUtc: "2026-01-01T00:00:00Z",
    isDefault: false,
    ...overrides,
  }
}

const main = branch("a", { isDefault: true })
const east = branch("b")
const closed = branch("c", { isActive: false })
const branches = [main, east, closed]

describe("resolveOwnBranchId", () => {
  it("uses the saved selection, matching case-insensitively", () => {
    expect(resolveOwnBranchId(branches, "B")).toBe("b")
  })

  it("falls back to the default branch when there is no selection", () => {
    expect(resolveOwnBranchId(branches, null)).toBe("a")
  })

  it("falls back to the default branch when the saved one no longer exists", () => {
    expect(resolveOwnBranchId(branches, "gone")).toBe("a")
  })

  it("uses the first active branch when none is flagged default", () => {
    expect(resolveOwnBranchId([closed, east], null)).toBe("b")
  })

  it("returns null for a tenant with no branches", () => {
    expect(resolveOwnBranchId([], null)).toBeNull()
  })
})

describe("branchFilterChoices", () => {
  it("offers every branch and 'All branches' to ViewAll holders", () => {
    expect(branchFilterChoices({ canViewAll: true, ownBranchId: "a" }, branches)).toEqual({
      allowAll: true,
      options: branches,
      locked: false,
    })
  })

  it("locks everyone else to their own branch", () => {
    expect(branchFilterChoices({ canViewAll: false, ownBranchId: "b" }, branches)).toEqual({
      allowAll: false,
      options: [east],
      locked: true,
    })
  })

  it("offers nothing when the own branch is unknown", () => {
    expect(branchFilterChoices({ canViewAll: false, ownBranchId: null }, branches).options).toEqual([])
  })
})

describe("effectiveBranchFilter", () => {
  it("keeps a ViewAll holder's selection, including all branches", () => {
    expect(effectiveBranchFilter({ canViewAll: true, ownBranchId: "a" }, "b")).toBe("b")
    expect(effectiveBranchFilter({ canViewAll: true, ownBranchId: "a" }, "")).toBe("")
  })

  it("pins everyone else to their own branch whatever was selected", () => {
    expect(effectiveBranchFilter({ canViewAll: false, ownBranchId: "a" }, "b")).toBe("a")
    expect(effectiveBranchFilter({ canViewAll: false, ownBranchId: "a" }, "")).toBe("a")
  })

  it("sends no branch when the own branch is unknown", () => {
    expect(effectiveBranchFilter({ canViewAll: false, ownBranchId: null }, "b")).toBe("")
  })
})
