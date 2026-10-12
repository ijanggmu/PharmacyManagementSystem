/**
 * URL helpers for the merged "Returns & refunds" page (/dashboard/returns).
 *
 * The active tab lives in `?view=returns|refunds`. Everything else in the query
 * string (e.g. `tab=supplier`, `action=create`) is preserved when the view changes.
 * Pure functions only — no React / Next imports — so they are unit-testable.
 */

export const RETURNS_PATH = "/dashboard/returns"

export const RETURNS_VIEWS = ["returns", "refunds"] as const
export type ReturnsView = (typeof RETURNS_VIEWS)[number]
export const DEFAULT_RETURNS_VIEW: ReturnsView = "returns"

/** Sub-tab inside the Returns view (customer vs supplier returns), from `?tab=`. */
export type ReturnsSubTab = "customer" | "supplier"

type ParamValue = string | string[] | null | undefined

function firstValue(value: ParamValue): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

/** Unknown / missing values fall back to the default ("returns"). */
export function parseReturnsView(value: ParamValue): ReturnsView {
  const v = firstValue(value)?.trim().toLowerCase()
  return (RETURNS_VIEWS as readonly string[]).includes(v ?? "") ? (v as ReturnsView) : DEFAULT_RETURNS_VIEW
}

export function parseReturnsSubTab(value: ParamValue): ReturnsSubTab {
  return firstValue(value)?.trim().toLowerCase() === "supplier" ? "supplier" : "customer"
}

/**
 * Build `/dashboard/returns?…` from the current query with the given params changed.
 * `null` removes a param; other existing params are kept in their original order.
 */
export function buildReturnsHref(
  current: string | URLSearchParams,
  changes: Record<string, string | null>,
  pathname: string = RETURNS_PATH,
): string {
  const params = new URLSearchParams(typeof current === "string" ? current : current.toString())
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/**
 * Target of the legacy /dashboard/refunds redirect: keep its query string and
 * force `view=refunds`. Accepts Next's `searchParams` record shape.
 */
export function refundsRedirectHref(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "view" || value === undefined) continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else params.append(key, value)
  }
  params.set("view", "refunds")
  return `${RETURNS_PATH}?${params.toString()}`
}

export const NEW_CUSTOMER_RETURN_PATH = "/dashboard/returns/customer/new"

/** The New customer return page for a sale, optionally starting with one of its lines selected. */
export function customerReturnHref(saleId: string, saleItemId?: string | null): string {
  const p = new URLSearchParams({ saleId })
  if (saleItemId) p.set("item", saleItemId)
  return `${NEW_CUSTOMER_RETURN_PATH}?${p.toString()}`
}
