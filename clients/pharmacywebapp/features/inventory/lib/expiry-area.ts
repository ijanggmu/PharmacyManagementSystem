/**
 * Stock › Expiry: one page, three tabs (?tab=). Pure helpers so the tab rules, the row badges and the write-off
 * block stay unit-testable.
 *
 * - Expiring soon: lots that will expire within a window. Sell them first, or claim them from the supplier.
 * - Expired: lots past expiry (and recalled lots). Write off what you'll destroy.
 * - Supplier claims: ask the supplier to credit or replace expired or near-expiry stock.
 */

import { canViewInventoryReports, dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"

export const EXPIRY_PATH = "/dashboard/inventory/expiry"

export const EXPIRY_TABS = ["expiring", "expired", "claims"] as const
export type ExpiryTab = (typeof EXPIRY_TABS)[number]

/** The day windows every expiry screen offers (the claim API accepts up to 180). */
export const EXPIRY_WINDOWS = [30, 60, 90, 180] as const
export type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number]

export function expiryHref(tab: ExpiryTab): string {
  return `${EXPIRY_PATH}?tab=${tab}`
}

/** Which tabs the caller may open: the two stock tabs are inventory reports, claims need Suppliers.Returns.View. */
export function allowedExpiryTabs(permissions: readonly string[]): ExpiryTab[] {
  const tabs: ExpiryTab[] = []
  if (canViewInventoryReports(permissions)) tabs.push("expiring", "expired")
  if (dotnetPermissionAllowed("expiry_claims:read", permissions)) tabs.push("claims")
  return tabs
}

/** The tab to show for `?tab=`: the requested one when allowed, else the first allowed one (null = none). */
export function resolveExpiryTab(raw: string | null | undefined, allowed: readonly ExpiryTab[]): ExpiryTab | null {
  const wanted = EXPIRY_TABS.find((t) => t === raw)
  if (wanted && allowed.includes(wanted)) return wanted
  return allowed[0] ?? null
}

export function parseExpiryWindow(raw: string | number | null | undefined, fallback: ExpiryWindow = 30): ExpiryWindow {
  const n = Number(raw)
  return (EXPIRY_WINDOWS as readonly number[]).includes(n) ? (n as ExpiryWindow) : fallback
}

export type RecallFilter = "all" | "expired-only" | "recalled-only"

/** The `isRecalled` query value for a filter (undefined = both). */
export function recallFilterParam(filter: RecallFilter): boolean | undefined {
  return filter === "all" ? undefined : filter === "recalled-only"
}

/** The count card's label follows the filter, so "Recalled only" isn't counted as "Expired batches". */
export function expiredCountLabel(filter: RecallFilter): string {
  return filter === "recalled-only" ? "Recalled batches" : filter === "expired-only" ? "Expired batches" : "Expired or recalled batches"
}

export interface ExpiredRowFlags {
  is_expired: boolean
  is_recalled: boolean
  open_claim_quantity: number
}

export type ExpiredRowBadge = "expired" | "recalled" | "on-claim"

/** The badges an Expired-tab row carries: expired and/or recalled, and "on claim" when an open claim holds it. */
export function expiredRowBadges(row: ExpiredRowFlags): ExpiredRowBadge[] {
  const badges: ExpiredRowBadge[] = []
  if (row.is_expired) badges.push("expired")
  if (row.is_recalled) badges.push("recalled")
  if (row.open_claim_quantity > 0) badges.push("on-claim")
  return badges
}

/** A lot on an open supplier claim waits for the supplier's answer; the API refuses to write it off. */
export function isOnOpenClaim(row: Pick<ExpiredRowFlags, "open_claim_quantity">): boolean {
  return row.open_claim_quantity > 0
}

/**
 * What "Write off all expired" covers: expired, not recalled (recalled lots are disposed one by one) and not on an
 * open claim. Returns the lots to write off and how many were skipped because a claim holds them.
 */
export function bulkWriteOffTargets<T extends ExpiredRowFlags>(rows: readonly T[]): { targets: T[]; skippedOnClaim: number } {
  const eligible = rows.filter((r) => r.is_expired && !r.is_recalled)
  const targets = eligible.filter((r) => !isOnOpenClaim(r))
  return { targets, skippedOnClaim: eligible.length - targets.length }
}
