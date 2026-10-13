/**
 * Page/tab map for the accounting area. The merged pages pick their tab with `?view=<id>`; the old
 * one-report routes redirect to the matching tab. Pure data + helpers so the layout, the pages and
 * the redirects all agree on the same URL contract.
 */

export const ACCOUNTING_BASE = "/dashboard/reports/accounting"

/** Gates beyond accounting access itself; a view with one is hidden from users who fail it. */
export type AccountingViewGate = "ird" | "openingBalances"

export interface AccountingViewDef {
  id: string
  label: string
  /** Whether this view reads the shared period / branch filters. */
  usesFilters: boolean
  /** View reports "as of" the period end rather than over the period. */
  asOf?: boolean
  /** Shows the "New journal" button, which opens the manual journal dialog. */
  newJournalAction?: boolean
  gate?: AccountingViewGate
}

export interface AccountingPageDef {
  key: string
  href: string
  title: string
  description: string
  /** First entry is the default view. A single view means the page has no tab bar. */
  views: readonly AccountingViewDef[]
}

export const ACCOUNTING_PAGES: readonly AccountingPageDef[] = [
  {
    key: "overview",
    href: ACCOUNTING_BASE,
    title: "Accounting overview",
    description: "Profit, cash, receivables and payables for the period at a glance, and what needs attention.",
    views: [{ id: "overview", label: "Overview", usesFilters: true, newJournalAction: true }],
  },
  {
    key: "register",
    href: `${ACCOUNTING_BASE}/register`,
    title: "Vouchers & ledger",
    description: "Every voucher in the period, line-by-line postings per account, and manual journal entries.",
    views: [
      { id: "register", label: "Voucher register", usesFilters: true, newJournalAction: true },
      { id: "ledger", label: "General ledger", usesFilters: true },
      { id: "journal", label: "Manual journals", usesFilters: true, newJournalAction: true },
    ],
  },
  {
    key: "cash",
    href: `${ACCOUNTING_BASE}/cash`,
    title: "Cash & bank",
    description: "Cash and bank movements for the period, deposits from the till, and bank statement matching.",
    views: [
      { id: "cash", label: "Cash & bank", usesFilters: true },
      { id: "bank-reconciliation", label: "Bank reconciliation", usesFilters: false },
    ],
  },
  {
    key: "receivables",
    href: `${ACCOUNTING_BASE}/receivables`,
    title: "Receivables & payables",
    description: "What customers owe you and what you owe suppliers — aging, ledgers, receipts and payments.",
    views: [
      { id: "receivables", label: "Receivables", usesFilters: true, asOf: true },
      { id: "payables", label: "Payables", usesFilters: true, asOf: true },
    ],
  },
  {
    key: "statements",
    href: `${ACCOUNTING_BASE}/statements`,
    title: "Statements",
    description: "Profit & loss, balance sheet, cash flow, trial balance and control-account reconciliation.",
    views: [
      { id: "profit-loss", label: "Profit & loss", usesFilters: true },
      { id: "balance-sheet", label: "Balance sheet", usesFilters: true, asOf: true },
      { id: "cash-flow", label: "Cash flow", usesFilters: true },
      { id: "trial-balance", label: "Trial balance", usesFilters: true },
      { id: "reconciliation", label: "Reconciliation", usesFilters: true, asOf: true },
    ],
  },
  {
    key: "vat",
    href: `${ACCOUNTING_BASE}/vat`,
    title: "Tax & IRD",
    description: "Output and input VAT for the period, TDS withheld from vendors, and the IRD sales and purchase registers for filing.",
    views: [
      { id: "vat", label: "VAT return", usesFilters: true },
      { id: "tds", label: "TDS", usesFilters: true },
      { id: "ird", label: "IRD reports", usesFilters: false, gate: "ird" },
    ],
  },
  {
    key: "chart-of-accounts",
    href: `${ACCOUNTING_BASE}/chart-of-accounts`,
    title: "Finance setup",
    description: "The accounts your vouchers post to, where each payment method's money goes, the TDS rates, and the opening balances you went live with.",
    views: [
      { id: "accounts", label: "Chart of accounts", usesFilters: false },
      { id: "payment-accounts", label: "Payment accounts", usesFilters: false },
      { id: "tds-rates", label: "TDS rates", usesFilters: false },
      { id: "opening-balances", label: "Opening balances", usesFilters: false, gate: "openingBalances" },
    ],
  },
]

export type AccountingGates = Partial<Record<AccountingViewGate, boolean>>

/** Views of a page the user may see. Gated views are hidden until their gate is known to pass. */
export function allowedViews(page: AccountingPageDef, gates: AccountingGates): AccountingViewDef[] {
  return page.views.filter((v) => !v.gate || gates[v.gate] === true)
}

/** The `?view=` value to use: the requested one if the page offers it, else the first (default) view. */
export function parseView(raw: string | null | undefined, views: readonly AccountingViewDef[]): AccountingViewDef | undefined {
  if (views.length === 0) return undefined
  const wanted = raw?.trim()
  return (wanted && views.find((v) => v.id === wanted)) || views[0]
}

/** The accounting page a pathname belongs to (sub-paths match their page; the base matches only itself). */
export function findAccountingPage(pathname: string | null | undefined): AccountingPageDef | undefined {
  if (!pathname) return undefined
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (path === ACCOUNTING_BASE) return ACCOUNTING_PAGES[0]
  return ACCOUNTING_PAGES.slice(1).find((p) => path === p.href || path.startsWith(`${p.href}/`))
}

export interface ActiveAccountingSection {
  page: AccountingPageDef
  views: AccountingViewDef[]
  view: AccountingViewDef
}

/** Page + active view for the header, filters and tab bar. */
export function resolveActiveSection(
  pathname: string | null | undefined,
  rawView: string | null | undefined,
  gates: AccountingGates,
): ActiveAccountingSection | undefined {
  const page = findAccountingPage(pathname)
  if (!page) return undefined
  const views = allowedViews(page, gates)
  const view = parseView(rawView, views)
  if (!view) return undefined
  return { page, views, view }
}

/**
 * URL for switching tabs on the current page: sets `view`, or drops it for the default view, and
 * keeps every other query param.
 */
export function buildViewHref(pathname: string, search: string | URLSearchParams, viewId: string, defaultViewId: string): string {
  const params = new URLSearchParams(search)
  if (viewId === defaultViewId) params.delete("view")
  else params.set("view", viewId)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export type IncomingSearchParams = Record<string, string | string[] | undefined>

/** Redirect target for an old route: the new page with `view` set, carrying the old query string. */
export function buildRedirectUrl(targetPath: string, viewId: string | null, incoming: IncomingSearchParams | undefined): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (key === "view" || value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v)
  }
  const qs = params.toString()
  const viewPart = viewId ? `view=${encodeURIComponent(viewId)}` : ""
  const query = [viewPart, qs].filter(Boolean).join("&")
  return query ? `${targetPath}?${query}` : targetPath
}

/** Old single-report routes and the merged tab each now lives on. */
export const LEGACY_ACCOUNTING_ROUTES = {
  ledger: { path: `${ACCOUNTING_BASE}/register`, view: "ledger" },
  journal: { path: `${ACCOUNTING_BASE}/register`, view: "journal" },
  "bank-reconciliation": { path: `${ACCOUNTING_BASE}/cash`, view: "bank-reconciliation" },
  payables: { path: `${ACCOUNTING_BASE}/receivables`, view: "payables" },
  "trial-balance": { path: `${ACCOUNTING_BASE}/statements`, view: "trial-balance" },
  reconciliation: { path: `${ACCOUNTING_BASE}/statements`, view: "reconciliation" },
  "opening-balances": { path: `${ACCOUNTING_BASE}/chart-of-accounts`, view: "opening-balances" },
} as const satisfies Record<string, { path: string; view: string }>

export type LegacyAccountingRoute = keyof typeof LEGACY_ACCOUNTING_ROUTES

export function legacyRedirectUrl(route: LegacyAccountingRoute, incoming: IncomingSearchParams | undefined): string {
  const target = LEGACY_ACCOUNTING_ROUTES[route]
  return buildRedirectUrl(target.path, target.view, incoming)
}

/**
 * True while the requested view is gated and the user's permissions haven't loaded yet — the page
 * should wait rather than flash (and fetch) the default view first.
 */
export function isViewPending(page: AccountingPageDef | undefined, rawView: string | null | undefined, gates: AccountingGates): boolean {
  const wanted = rawView?.trim()
  if (!page || !wanted) return false
  const view = page.views.find((v) => v.id === wanted)
  return !!view?.gate && gates[view.gate] === undefined
}
