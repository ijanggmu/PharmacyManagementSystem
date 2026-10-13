import { describe, expect, it } from "vitest"
import {
  ACCOUNTING_BASE,
  ACCOUNTING_PAGES,
  allowedViews,
  buildRedirectUrl,
  buildViewHref,
  findAccountingPage,
  isViewPending,
  legacyRedirectUrl,
  parseView,
  resolveActiveSection,
} from "./accounting-views"

const page = (key: string) => {
  const found = ACCOUNTING_PAGES.find((p) => p.key === key)
  if (!found) throw new Error(`no page ${key}`)
  return found
}

describe("ACCOUNTING_PAGES", () => {
  it("defines the merged pages with their tab order", () => {
    const map = Object.fromEntries(ACCOUNTING_PAGES.map((p) => [p.href, p.views.map((v) => v.id)]))
    expect(map).toEqual({
      [ACCOUNTING_BASE]: ["overview"],
      [`${ACCOUNTING_BASE}/register`]: ["register", "ledger", "journal"],
      [`${ACCOUNTING_BASE}/cash`]: ["cash", "cheques", "bank-reconciliation"],
      [`${ACCOUNTING_BASE}/receivables`]: ["receivables", "payables"],
      [`${ACCOUNTING_BASE}/statements`]: ["profit-loss", "balance-sheet", "trial-balance", "reconciliation"],
      [`${ACCOUNTING_BASE}/vat`]: ["vat", "tds", "ird"],
      [`${ACCOUNTING_BASE}/chart-of-accounts`]: ["accounts", "payment-accounts", "tds-rates", "opening-balances"],
    })
  })

  it("has unique view ids per page", () => {
    for (const p of ACCOUNTING_PAGES) {
      expect(new Set(p.views.map((v) => v.id)).size).toBe(p.views.length)
    }
  })
})

describe("parseView", () => {
  const views = page("statements").views

  it("defaults to the first view when missing, blank or unknown", () => {
    expect(parseView(null, views)?.id).toBe("profit-loss")
    expect(parseView(undefined, views)?.id).toBe("profit-loss")
    expect(parseView("  ", views)?.id).toBe("profit-loss")
    expect(parseView("nope", views)?.id).toBe("profit-loss")
  })

  it("returns the requested view when offered", () => {
    expect(parseView("trial-balance", views)?.id).toBe("trial-balance")
    expect(parseView(" balance-sheet ", views)?.id).toBe("balance-sheet")
  })

  it("returns undefined for no views", () => {
    expect(parseView("x", [])).toBeUndefined()
  })
})

describe("allowedViews", () => {
  it("hides gated views until the gate is known to pass", () => {
    expect(allowedViews(page("vat"), {}).map((v) => v.id)).toEqual(["vat", "tds"])
    expect(allowedViews(page("vat"), { ird: false }).map((v) => v.id)).toEqual(["vat", "tds"])
    expect(allowedViews(page("vat"), { ird: true }).map((v) => v.id)).toEqual(["vat", "tds", "ird"])
    expect(allowedViews(page("chart-of-accounts"), { ird: true }).map((v) => v.id)).toEqual(["accounts", "payment-accounts", "tds-rates"])
    expect(allowedViews(page("chart-of-accounts"), { openingBalances: true }).map((v) => v.id)).toEqual([
      "accounts",
      "payment-accounts",
      "tds-rates",
      "opening-balances",
    ])
  })
})

describe("findAccountingPage", () => {
  it("matches the base only exactly, and sub-paths to their page", () => {
    expect(findAccountingPage(ACCOUNTING_BASE)?.key).toBe("overview")
    expect(findAccountingPage(`${ACCOUNTING_BASE}/`)?.key).toBe("overview")
    expect(findAccountingPage(`${ACCOUNTING_BASE}/register`)?.key).toBe("register")
    expect(findAccountingPage(`${ACCOUNTING_BASE}/statements/`)?.key).toBe("statements")
    expect(findAccountingPage(`${ACCOUNTING_BASE}/cash/extra`)?.key).toBe("cash")
    expect(findAccountingPage(`${ACCOUNTING_BASE}/cashflow`)).toBeUndefined()
    expect(findAccountingPage("/dashboard/expenses")).toBeUndefined()
    expect(findAccountingPage(null)).toBeUndefined()
  })
})

describe("resolveActiveSection", () => {
  it("resolves page, allowed views and active view", () => {
    const r = resolveActiveSection(`${ACCOUNTING_BASE}/statements`, "balance-sheet", {})
    expect(r?.page.title).toBe("Statements")
    expect(r?.view.id).toBe("balance-sheet")
    expect(r?.view.asOf).toBe(true)
    expect(r?.views).toHaveLength(4)
  })

  it("follows the active tab for filter behaviour", () => {
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/statements`, null, {})?.view).toMatchObject({ id: "profit-loss", usesFilters: true })
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/statements`, null, {})?.view.asOf).toBeFalsy()
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/cash`, "bank-reconciliation", {})?.view.usesFilters).toBe(false)
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/register`, "ledger", {})?.view.newJournalAction).toBeFalsy()
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/register`, "journal", {})?.view.newJournalAction).toBe(true)
  })

  it("falls back to the default view when the requested one is gated off", () => {
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/vat`, "ird", { ird: false })?.view.id).toBe("vat")
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/vat`, "ird", { ird: true })?.view.id).toBe("ird")
    expect(resolveActiveSection(`${ACCOUNTING_BASE}/chart-of-accounts`, "opening-balances", {})?.view.id).toBe("accounts")
  })

  it("uses the merged page titles", () => {
    const titles = ["register", "cash", "receivables", "statements", "vat", "chart-of-accounts"].map(
      (k) => resolveActiveSection(`${ACCOUNTING_BASE}/${k}`, null, {})?.page.title
    )
    expect(titles).toEqual(["Vouchers & ledger", "Cash & bank", "Receivables & payables", "Statements", "Tax & IRD", "Finance setup"])
  })

  it("is undefined outside the accounting pages", () => {
    expect(resolveActiveSection("/dashboard/reports/ird", null, {})).toBeUndefined()
  })
})

describe("isViewPending", () => {
  it("waits only for a requested gated view whose gate hasn't loaded", () => {
    expect(isViewPending(page("vat"), "ird", {})).toBe(true)
    expect(isViewPending(page("vat"), "ird", { ird: false })).toBe(false)
    expect(isViewPending(page("vat"), "ird", { ird: true })).toBe(false)
    expect(isViewPending(page("vat"), "vat", {})).toBe(false)
    expect(isViewPending(page("vat"), null, {})).toBe(false)
    expect(isViewPending(undefined, "ird", {})).toBe(false)
  })
})

describe("buildViewHref", () => {
  const path = `${ACCOUNTING_BASE}/register`

  it("sets view and keeps other params", () => {
    expect(buildViewHref(path, "?accountId=a1&page=2", "ledger", "register")).toBe(`${path}?accountId=a1&page=2&view=ledger`)
    expect(buildViewHref(path, "view=journal&accountId=a1", "ledger", "register")).toBe(`${path}?view=ledger&accountId=a1`)
  })

  it("drops view for the default tab", () => {
    expect(buildViewHref(path, "?view=ledger&accountId=a1", "register", "register")).toBe(`${path}?accountId=a1`)
    expect(buildViewHref(path, "?view=ledger", "register", "register")).toBe(path)
    expect(buildViewHref(path, "", "register", "register")).toBe(path)
  })

  it("accepts URLSearchParams", () => {
    expect(buildViewHref(path, new URLSearchParams({ q: "x" }), "journal", "register")).toBe(`${path}?q=x&view=journal`)
  })
})

describe("buildRedirectUrl / legacyRedirectUrl", () => {
  it("sets view first and carries the old query string", () => {
    expect(buildRedirectUrl("/a", "ledger", { accountId: "x y", page: "2" })).toBe("/a?view=ledger&accountId=x+y&page=2")
    expect(buildRedirectUrl("/a", "ledger", { tag: ["1", "2"], skip: undefined })).toBe("/a?view=ledger&tag=1&tag=2")
    expect(buildRedirectUrl("/a", "ledger", undefined)).toBe("/a?view=ledger")
    expect(buildRedirectUrl("/a", null, {})).toBe("/a")
  })

  it("ignores an incoming view param", () => {
    expect(buildRedirectUrl("/a", "payables", { view: "receivables", q: "1" })).toBe("/a?view=payables&q=1")
  })

  it("maps every old route to its merged tab", () => {
    const map = {
      ledger: `${ACCOUNTING_BASE}/register?view=ledger`,
      journal: `${ACCOUNTING_BASE}/register?view=journal`,
      "bank-reconciliation": `${ACCOUNTING_BASE}/cash?view=bank-reconciliation`,
      payables: `${ACCOUNTING_BASE}/receivables?view=payables`,
      "trial-balance": `${ACCOUNTING_BASE}/statements?view=trial-balance`,
      reconciliation: `${ACCOUNTING_BASE}/statements?view=reconciliation`,
      "opening-balances": `${ACCOUNTING_BASE}/chart-of-accounts?view=opening-balances`,
    } as const
    for (const [route, url] of Object.entries(map) as [keyof typeof map, string][]) {
      expect(legacyRedirectUrl(route, {})).toBe(url)
    }
    expect(legacyRedirectUrl("ledger", { accountId: "abc" })).toBe(`${ACCOUNTING_BASE}/register?view=ledger&accountId=abc`)
  })

  it("redirects only to views the target page defines", () => {
    for (const route of ["ledger", "journal", "bank-reconciliation", "payables", "trial-balance", "reconciliation", "opening-balances"] as const) {
      const url = new URL(legacyRedirectUrl(route, {}), "http://x")
      const target = findAccountingPage(url.pathname)
      expect(target?.views.map((v) => v.id)).toContain(url.searchParams.get("view"))
    }
  })
})
