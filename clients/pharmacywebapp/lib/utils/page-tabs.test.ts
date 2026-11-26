import { describe, expect, it } from "vitest"
import { buildTabHref, resolveTabValue, scrollDeltaToReveal } from "./page-tabs"

const TABS = ["users", "roles", "system"] as const

describe("resolveTabValue", () => {
  it("returns the requested tab when offered", () => {
    expect(resolveTabValue("roles", TABS)).toBe("roles")
    expect(resolveTabValue(" roles ", TABS)).toBe("roles")
  })

  it("falls back to the fallback, then the first tab", () => {
    expect(resolveTabValue("nope", TABS, "system")).toBe("system")
    expect(resolveTabValue(null, TABS)).toBe("users")
    expect(resolveTabValue(undefined, TABS, "system")).toBe("system")
  })

  it("ignores a fallback that is not offered (e.g. hidden by permission)", () => {
    expect(resolveTabValue(null, ["roles", "system"], "users" as "roles")).toBe("roles")
  })

  it("is undefined when no tab is offered", () => {
    expect(resolveTabValue("users", [])).toBeUndefined()
  })
})

describe("buildTabHref", () => {
  it("sets the param and keeps the others", () => {
    expect(buildTabHref("/dashboard/settings", "?q=1", "tab", "roles", "users")).toBe("/dashboard/settings?q=1&tab=roles")
  })

  it("drops the param for the default tab", () => {
    expect(buildTabHref("/x", "tab=roles&q=1", "tab", "users", "users")).toBe("/x?q=1")
    expect(buildTabHref("/x", "tab=roles", "tab", "users", "users")).toBe("/x")
  })

  it("supports a custom param name", () => {
    expect(buildTabHref("/x", "", "view", "settlements", "outstanding")).toBe("/x?view=settlements")
  })
})

describe("scrollDeltaToReveal", () => {
  const box = { left: 0, right: 300 }
  it("is 0 when the item is already visible", () => {
    expect(scrollDeltaToReveal(box, { left: 50, right: 120 })).toBe(0)
  })
  it("scrolls left for an item clipped on the left", () => {
    expect(scrollDeltaToReveal(box, { left: -40, right: 30 }, 10)).toBe(-50)
  })
  it("scrolls right for an item clipped on the right", () => {
    expect(scrollDeltaToReveal(box, { left: 260, right: 340 }, 10)).toBe(50)
  })
})
