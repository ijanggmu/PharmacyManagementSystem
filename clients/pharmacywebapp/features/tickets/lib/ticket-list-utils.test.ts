import { describe, expect, it } from "vitest"
import {
  clampPage,
  filterTicketsByKeyword,
  formatRelativeShort,
  isPermissionErrorMessage,
  nextListIndex,
  pageWindow,
  shortId,
  ticketDetailHref,
  totalPagesFor,
} from "./ticket-list-utils"

describe("paging maths", () => {
  it("computes total pages with a floor of 1", () => {
    expect(totalPagesFor(0, 10)).toBe(1)
    expect(totalPagesFor(10, 10)).toBe(1)
    expect(totalPagesFor(11, 10)).toBe(2)
    expect(totalPagesFor(42, 20)).toBe(3)
    expect(totalPagesFor(5, 0)).toBe(1)
  })

  it("clamps pages into range", () => {
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(9, 5)).toBe(5)
    expect(clampPage(3, 5)).toBe(3)
    expect(clampPage(Number.NaN, 5)).toBe(1)
    expect(clampPage(2, 0)).toBe(1)
  })

  it("builds the visible window", () => {
    expect(pageWindow(1, 10, 42)).toEqual({ startIndex: 0, from: 1, to: 10 })
    expect(pageWindow(5, 10, 42)).toEqual({ startIndex: 40, from: 41, to: 42 })
    expect(pageWindow(9, 10, 42)).toEqual({ startIndex: 40, from: 41, to: 42 })
    expect(pageWindow(1, 10, 0)).toEqual({ startIndex: 0, from: 0, to: 0 })
  })
})

describe("filterTicketsByKeyword", () => {
  const tickets = [
    { number: "TCK-0001", title: "Printer jam at counter", tenantId: "acme" },
    { number: "TCK-0002", title: "Login fails", tenantId: "beta" },
    { number: "TCK-0010", title: "Receipt printer offline", tenantId: null },
  ]

  it("returns everything for a blank keyword", () => {
    expect(filterTicketsByKeyword(tickets, "  ")).toHaveLength(3)
  })

  it("matches title case-insensitively", () => {
    expect(filterTicketsByKeyword(tickets, "PRINTER").map((t) => t.number)).toEqual(["TCK-0001", "TCK-0010"])
  })

  it("matches number with or without #", () => {
    expect(filterTicketsByKeyword(tickets, "#tck-0002")).toHaveLength(1)
    expect(filterTicketsByKeyword(tickets, "0010")).toHaveLength(1)
  })

  it("matches tenant id and ANDs terms", () => {
    expect(filterTicketsByKeyword(tickets, "beta")).toHaveLength(1)
    expect(filterTicketsByKeyword(tickets, "printer acme").map((t) => t.number)).toEqual(["TCK-0001"])
    expect(filterTicketsByKeyword(tickets, "printer zzz")).toHaveLength(0)
  })
})

describe("nextListIndex", () => {
  it("moves within bounds", () => {
    expect(nextListIndex(0, "ArrowDown", 3)).toBe(1)
    expect(nextListIndex(2, "ArrowDown", 3)).toBe(2)
    expect(nextListIndex(0, "ArrowUp", 3)).toBe(0)
    expect(nextListIndex(1, "Home", 3)).toBe(0)
    expect(nextListIndex(1, "End", 3)).toBe(2)
  })
  it("ignores other keys and empty lists", () => {
    expect(nextListIndex(0, "Enter", 3)).toBeNull()
    expect(nextListIndex(0, "ArrowDown", 0)).toBeNull()
  })
})

describe("formatRelativeShort", () => {
  const now = new Date("2026-10-09T12:00:00Z")
  it("formats recent times compactly", () => {
    expect(formatRelativeShort("2026-10-09T11:59:30Z", now)).toBe("just now")
    expect(formatRelativeShort("2026-10-09T11:55:00Z", now)).toBe("5m ago")
    expect(formatRelativeShort("2026-10-09T09:00:00Z", now)).toBe("3h ago")
    expect(formatRelativeShort("2026-10-07T12:00:00Z", now)).toBe("2d ago")
  })
  it("falls back to a date for older items and handles bad input", () => {
    expect(formatRelativeShort("2026-08-01T12:00:00Z", now)).toMatch(/Aug/)
    expect(formatRelativeShort("2024-08-01T12:00:00Z", now)).toMatch(/2024/)
    expect(formatRelativeShort("not a date", now)).toBe("—")
  })
})

describe("misc helpers", () => {
  it("builds detail hrefs per scope", () => {
    expect(ticketDetailHref("a b", false)).toBe("/dashboard/tickets/a%20b")
    expect(ticketDetailHref("x", true)).toBe("/dashboard/tickets/x?scope=all-tenants")
  })
  it("detects permission errors", () => {
    expect(isPermissionErrorMessage("403 Forbidden")).toBe(true)
    expect(isPermissionErrorMessage("Missing permission Tickets.View")).toBe(true)
    expect(isPermissionErrorMessage("Network error")).toBe(false)
  })
  it("shortens ids", () => {
    expect(shortId("1234567890")).toBe("12345678")
    expect(shortId(null)).toBe("—")
  })
})
