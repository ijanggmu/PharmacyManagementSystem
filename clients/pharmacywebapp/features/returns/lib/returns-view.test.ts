import { describe, expect, it } from "vitest"
import {
  customerReturnHref,
  buildReturnsHref,
  parseReturnsSubTab,
  parseReturnsView,
  refundsRedirectHref,
} from "./returns-view"

describe("parseReturnsView", () => {
  it("defaults to returns for missing or unknown values", () => {
    expect(parseReturnsView(null)).toBe("returns")
    expect(parseReturnsView(undefined)).toBe("returns")
    expect(parseReturnsView("")).toBe("returns")
    expect(parseReturnsView("nope")).toBe("returns")
  })

  it("accepts known views case-insensitively and takes the first array value", () => {
    expect(parseReturnsView("refunds")).toBe("refunds")
    expect(parseReturnsView(" Refunds ")).toBe("refunds")
    expect(parseReturnsView("returns")).toBe("returns")
    expect(parseReturnsView(["refunds", "returns"])).toBe("refunds")
  })
})

describe("parseReturnsSubTab", () => {
  it("only recognises supplier; everything else is customer", () => {
    expect(parseReturnsSubTab("supplier")).toBe("supplier")
    expect(parseReturnsSubTab("customer")).toBe("customer")
    expect(parseReturnsSubTab(null)).toBe("customer")
  })
})

describe("buildReturnsHref", () => {
  it("sets the view while keeping other params", () => {
    expect(buildReturnsHref("tab=supplier&page=2", { view: "refunds" })).toBe(
      "/dashboard/returns?tab=supplier&page=2&view=refunds",
    )
  })

  it("replaces an existing view in place and removes null params", () => {
    expect(buildReturnsHref(new URLSearchParams("view=returns&action=create"), { view: "refunds", action: null })).toBe(
      "/dashboard/returns?view=refunds",
    )
  })

  it("returns the bare path when nothing is left", () => {
    expect(buildReturnsHref("action=create", { action: null })).toBe("/dashboard/returns")
  })
})

describe("refundsRedirectHref", () => {
  it("forces view=refunds", () => {
    expect(refundsRedirectHref({})).toBe("/dashboard/returns?view=refunds")
  })

  it("carries the query string over, including repeated params, and overrides any view", () => {
    expect(refundsRedirectHref({ action: "create", view: "returns", s: ["a", "b"], x: undefined })).toBe(
      "/dashboard/returns?action=create&s=a&s=b&view=refunds",
    )
  })
})

describe("customerReturnHref", () => {
  it("links to the sale, with the starting line when given", () => {
    expect(customerReturnHref("s1")).toBe("/dashboard/returns/customer/new?saleId=s1")
    expect(customerReturnHref("s1", "i2")).toBe("/dashboard/returns/customer/new?saleId=s1&item=i2")
    expect(customerReturnHref("s1", null)).toBe("/dashboard/returns/customer/new?saleId=s1")
  })
})
