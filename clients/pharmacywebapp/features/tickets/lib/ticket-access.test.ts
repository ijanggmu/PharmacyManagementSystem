import { describe, expect, it } from "vitest"
import { ticketActionAccess, type TicketAccessInput } from "./ticket-access"

const ME = "user-me"
const OTHER = "user-other"
const BASIC = ["Permissions.Tickets.View", "Permissions.Tickets.Create"]
const ADMIN = [
  ...BASIC,
  "Permissions.Tickets.ViewAll",
  "Permissions.Tickets.Assign",
  "Permissions.Tickets.Resolve",
  "Permissions.Tickets.Reopen",
  "Permissions.Tickets.Close",
  "Permissions.Tickets.Comment",
]

function access(overrides: Partial<TicketAccessInput>) {
  return ticketActionAccess({
    permissions: BASIC,
    currentUserId: ME,
    reporterUserId: ME,
    status: "Open",
    crossTenant: false,
    ...overrides,
  })
}

describe("ticketActionAccess — reporter (basic permissions only)", () => {
  it("can comment on their own open ticket but not assign or resolve it", () => {
    const a = access({})
    expect(a.isReporter).toBe(true)
    expect(a.canComment).toBe(true)
    expect(a.canAssign).toBe(false)
    expect(a.canResolve).toBe(false)
    expect(a.canClose).toBe(false)
    expect(a.canReopen).toBe(false)
  })

  it("can close their own resolved ticket and reopen it", () => {
    const resolved = access({ status: "Resolved" })
    expect(resolved.canClose).toBe(true)
    expect(resolved.canReopen).toBe(true)
    const closed = access({ status: "Closed" })
    expect(closed.canClose).toBe(false)
    expect(closed.canReopen).toBe(true)
    expect(closed.canComment).toBe(false)
  })

  it("gets nothing on someone else's ticket", () => {
    const a = access({ reporterUserId: OTHER, status: "Resolved" })
    expect(a).toEqual({ isReporter: false, canAssign: false, canResolve: false, canReopen: false, canClose: false, canComment: false })
  })

  it("is not treated as reporter before the current user is known", () => {
    expect(access({ currentUserId: null, reporterUserId: ME }).canComment).toBe(false)
  })
})

describe("ticketActionAccess — tenant admin (ViewAll + action permissions)", () => {
  it("can act on anyone's ticket", () => {
    const open = access({ permissions: ADMIN, reporterUserId: OTHER })
    expect(open.canAssign).toBe(true)
    expect(open.canResolve).toBe(true)
    expect(open.canComment).toBe(true)
    const resolved = access({ permissions: ADMIN, reporterUserId: OTHER, status: "Resolved" })
    expect(resolved.canClose).toBe(true)
    expect(resolved.canReopen).toBe(true)
    expect(resolved.canResolve).toBe(false)
    expect(resolved.canAssign).toBe(false)
  })

  it("needs ViewAll for other users' tickets even with the action permission", () => {
    const noViewAll = ADMIN.filter((p) => p !== "Permissions.Tickets.ViewAll")
    const a = access({ permissions: noViewAll, reporterUserId: OTHER, status: "Resolved" })
    expect(a.canClose).toBe(false)
    expect(a.canReopen).toBe(false)
    expect(a.canComment).toBe(false)
  })
})

describe("ticketActionAccess — all-tenants desk", () => {
  it("is read-only", () => {
    const a = access({ permissions: ADMIN, crossTenant: true, status: "Resolved" })
    expect(Object.values(a).every((v) => v === false)).toBe(true)
  })
})
