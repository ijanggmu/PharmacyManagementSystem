import { describe, expect, it } from "vitest"
import { Home } from "lucide-react"
import { isPathAllowed, parseUsage, rankRecent, recordVisit, resolveActiveHref, visibleSections, type NavLeaf, type NavSection } from "./nav-model"

const leaf = (href: string, extra: Partial<NavLeaf> = {}): NavLeaf => ({ name: href, href, icon: Home, ...extra })

const LEAVES: NavLeaf[] = [
  leaf("/dashboard", { exact: true }),
  leaf("/dashboard/inventory"),
  leaf("/dashboard/inventory/expired"),
  leaf("/dashboard/returns", { match: ["/dashboard/refunds"] }),
  leaf("/dashboard/reports", { exact: true }),
  leaf("/dashboard/reports/accounting/register", { match: ["/dashboard/reports/accounting/ledger"] }),
  leaf("/dashboard/tenants"),
  leaf("/dashboard/tenants/billing"),
  leaf("/dashboard/settings", { exact: true }),
  leaf("/dashboard/settings/system-logs"),
]

describe("resolveActiveHref", () => {
  it("prefers the most specific match", () => {
    expect(resolveActiveHref("/dashboard/inventory/expired", LEAVES)).toBe("/dashboard/inventory/expired")
    expect(resolveActiveHref("/dashboard/inventory", LEAVES)).toBe("/dashboard/inventory")
    expect(resolveActiveHref("/dashboard/tenants/billing", LEAVES)).toBe("/dashboard/tenants/billing")
    expect(resolveActiveHref("/dashboard/tenants/abc/overview", LEAVES)).toBe("/dashboard/tenants")
  })

  it("honours exact items and alias prefixes", () => {
    expect(resolveActiveHref("/dashboard", LEAVES)).toBe("/dashboard")
    expect(resolveActiveHref("/dashboard/profile", LEAVES)).toBeNull()
    expect(resolveActiveHref("/dashboard/refunds/new", LEAVES)).toBe("/dashboard/returns")
    expect(resolveActiveHref("/dashboard/reports/accounting/ledger", LEAVES)).toBe("/dashboard/reports/accounting/register")
    expect(resolveActiveHref("/dashboard/settings/system-logs", LEAVES)).toBe("/dashboard/settings/system-logs")
  })
})

describe("visibleSections", () => {
  it("drops hidden items and empty sections", () => {
    const sections: NavSection[] = [
      { id: "a", items: [leaf("/x", { check: () => false }), leaf("/y")] },
      { id: "b", items: [leaf("/z", { check: () => false })] },
      { id: "c", check: () => false, items: [leaf("/w")] },
    ]
    const result = visibleSections(sections, (n) => (n.check ? n.check([]) : true))
    expect(result.map((s) => s.id)).toEqual(["a"])
    expect(result[0].items.map((i) => i.href)).toEqual(["/y"])
  })
})

describe("isPathAllowed", () => {
  const sections: NavSection[] = [
    { id: "home", items: [leaf("/dashboard", { exact: true })] },
    { id: "stock", items: [leaf("/dashboard/inventory"), leaf("/dashboard/inventory/expired", { check: () => false })] },
    { id: "finance", check: () => false, items: [leaf("/dashboard/reports/accounting", { exact: true }), leaf("/dashboard/expenses")] },
    { id: "sell", items: [leaf("/dashboard/returns", { match: ["/dashboard/refunds"], check: () => false })] },
    { id: "dup", items: [leaf("/dashboard/inventory?expiryFilter=expiring", { check: () => false }), leaf("/dashboard/inventory?view=all")] },
  ]
  const isVisible = (n: { check?: (p: string[]) => boolean }) => (n.check ? n.check([]) : true)

  it("allows visible items and their sub-routes", () => {
    expect(isPathAllowed("/dashboard", sections, isVisible)).toBe(true)
    expect(isPathAllowed("/dashboard/inventory/123", sections, isVisible)).toBe(true)
  })

  it("denies a hidden item even under a visible parent", () => {
    expect(isPathAllowed("/dashboard/inventory/expired", sections, isVisible)).toBe(false)
  })

  it("denies every item of a hidden section, and alias prefixes of hidden items", () => {
    expect(isPathAllowed("/dashboard/reports/accounting", sections, isVisible)).toBe(false)
    expect(isPathAllowed("/dashboard/expenses/new", sections, isVisible)).toBe(false)
    expect(isPathAllowed("/dashboard/refunds/new", sections, isVisible)).toBe(false)
  })

  it("allows paths no item owns, and ties when any tied item is visible", () => {
    expect(isPathAllowed("/dashboard/profile", sections, isVisible)).toBe(true)
    expect(isPathAllowed("/dashboard/reports/accounting/ledger", [sections[2]], isVisible)).toBe(true)
    expect(isPathAllowed("/dashboard/inventory", [sections[4]], isVisible)).toBe(true)
  })

  it("checks extra leaves outside the sections", () => {
    expect(isPathAllowed("/dashboard/tickets/1", sections, isVisible, [leaf("/dashboard/tickets", { check: () => false })])).toBe(false)
  })
})

describe("recently used", () => {
  const day = 86_400_000
  const now = 100 * day

  it("ranks by frequency with recency decay and skips excluded or hidden items", () => {
    let usage = {}
    for (let i = 0; i < 5; i++) usage = recordVisit(usage, "/dashboard/inventory", now - 30 * day) // old, frequent
    for (let i = 0; i < 3; i++) usage = recordVisit(usage, "/dashboard/returns", now) // recent
    usage = recordVisit(usage, "/dashboard", now)
    usage = recordVisit(usage, "/dashboard/gone", now)
    const ranked = rankRecent(usage, LEAVES, now, 3, ["/dashboard"]).map((l) => l.href)
    expect(ranked).toEqual(["/dashboard/returns", "/dashboard/inventory"])
  })

  it("keeps the usage map bounded", () => {
    let usage = {}
    for (let i = 0; i < 40; i++) usage = recordVisit(usage, `/p/${i}`, i)
    expect(Object.keys(usage)).toHaveLength(30)
    expect(usage).toHaveProperty("/p/39")
    expect(usage).not.toHaveProperty("/p/0")
  })

  it("parses stored usage defensively", () => {
    expect(parseUsage(null)).toEqual({})
    expect(parseUsage("not json")).toEqual({})
    expect(parseUsage(JSON.stringify({ "/a": { count: 2, last: 5 }, "/b": "junk" }))).toEqual({ "/a": { count: 2, last: 5 } })
  })
})
