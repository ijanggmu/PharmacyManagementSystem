import type { LucideIcon } from "lucide-react"
import type { Permission } from "@/lib/security/rbac-types"

/**
 * Sidebar model: sections of links, grouped by the job being done (Sell, Stock, Finance…).
 * Pure helpers here (active-item resolution, permission filtering, "recently used" ranking) are kept
 * out of the shell component so they can be unit-tested.
 */

export interface NavLeaf {
  name: string
  href: string
  icon: LucideIcon
  badge?: string | null
  permission?: Permission | Permission[]
  check?: (permissions: string[]) => boolean
  /** Active only on this exact path (index pages such as Dashboard). */
  exact?: boolean
  /** Other route prefixes that belong to this item (old routes now shown as tabs, sub-flows). */
  match?: string[]
}

export interface NavSection {
  id: string
  /** Section heading; omitted for the top block (Dashboard). */
  label?: string
  /** Section icon — used for collapsible sections in the collapsed rail. */
  icon?: LucideIcon
  /** Collapsible sections (Finance, Platform) render their label as a toggle. */
  collapsible?: boolean
  /** Visual separation for super-admin-only sections. */
  tone?: "platform"
  permission?: Permission | Permission[]
  check?: (permissions: string[]) => boolean
  items: NavLeaf[]
}

export type VisibilityCheck = (node: { permission?: Permission | Permission[]; check?: (permissions: string[]) => boolean }) => boolean

const path = (href: string) => href.split("?")[0]

/** Sections the user can see, each with only its visible items; empty sections are dropped. */
export function visibleSections(sections: NavSection[], isVisible: VisibilityCheck): NavSection[] {
  return sections
    .filter((s) => isVisible(s))
    .map((s) => ({ ...s, items: s.items.filter((i) => isVisible(i)) }))
    .filter((s) => s.items.length > 0)
}

/** Length of the longest route prefix of `leaf` that matches `pathname` (0 = no match). */
function matchLength(pathname: string, leaf: NavLeaf): number {
  const primary = path(leaf.href)
  if (leaf.exact) return pathname === primary ? primary.length : 0
  let best = 0
  for (const prefix of [primary, ...(leaf.match ?? [])]) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && prefix.length > best) best = prefix.length
  }
  return best
}

/**
 * The single active item for `pathname`: the most specific match wins, so /dashboard/inventory/expired
 * highlights "Expiry & recalls" rather than "Medicines", and /dashboard/tenants/billing highlights
 * "Billing" rather than "Tenants". Returns the item's href, or null.
 */
export function resolveActiveHref(pathname: string, leaves: NavLeaf[]): string | null {
  let best: { href: string; length: number } | null = null
  for (const leaf of leaves) {
    const length = matchLength(pathname, leaf)
    if (length > 0 && (!best || length > best.length)) best = { href: leaf.href, length }
  }
  return best?.href ?? null
}

/**
 * Whether the user may open `pathname`, judged by the nav item that owns it: the most specific match
 * (same rule as resolveActiveHref) must be visible, and so must its section. When several items tie
 * (one route under two links), any visible one grants. A path no item owns (profile, a detail page
 * outside the menu) is allowed — the page and the backend enforce their own gates.
 */
export function isPathAllowed(pathname: string, sections: NavSection[], isVisible: VisibilityCheck, extraLeaves: NavLeaf[] = []): boolean {
  let bestLength = 0
  let allowed = true
  const consider = (leaf: NavLeaf, visible: boolean) => {
    const length = matchLength(pathname, leaf)
    if (length === 0) return
    if (length > bestLength) {
      bestLength = length
      allowed = visible
    } else if (length === bestLength && visible) {
      allowed = true
    }
  }
  for (const section of sections) {
    const sectionVisible = isVisible(section)
    for (const leaf of section.items) consider(leaf, sectionVisible && isVisible(leaf))
  }
  for (const leaf of extraLeaves) consider(leaf, isVisible(leaf))
  return allowed
}

/**
 * Browser-tab title for a dashboard page: the menu item (or action page) that owns the path, then the
 * pharmacy's name, e.g. "Sales history · Demo Pharmacy". A path no item owns gets just the workspace name.
 */
export function pageTitle(pathname: string, leaves: NavLeaf[], workspace: string | null | undefined): string {
  const brand = workspace?.trim() || "PharmaCare"
  const href = resolveActiveHref(pathname, leaves)
  const name = href ? leaves.find((leaf) => leaf.href === href)?.name : undefined
  return name ? `${name} · ${brand}` : brand
}

// ---------- Recently used ------------------------------------------------------------------------

export interface UsageEntry {
  count: number
  /** Epoch ms of the last visit. */
  last: number
}

export type UsageMap = Record<string, UsageEntry>

const HALF_LIFE_DAYS = 7
const MAX_TRACKED = 30

/** Records a visit to `href`, keeping the map bounded (least-recent entries dropped). */
export function recordVisit(usage: UsageMap, href: string, now: number): UsageMap {
  const prev = usage[href]
  const next: UsageMap = { ...usage, [href]: { count: (prev?.count ?? 0) + 1, last: now } }
  const keys = Object.keys(next)
  if (keys.length <= MAX_TRACKED) return next
  const kept = keys.sort((a, b) => next[b].last - next[a].last).slice(0, MAX_TRACKED)
  return Object.fromEntries(kept.map((k) => [k, next[k]]))
}

/** Frequency with recency decay: a visit counts half as much after a week. */
export function usageScore(entry: UsageEntry, now: number): number {
  const ageDays = Math.max(0, now - entry.last) / 86_400_000
  return entry.count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

/**
 * Top `limit` items the user visits most (recency-weighted), limited to items they can still see and
 * excluding `excludeHrefs` (e.g. Dashboard, which is always one click away).
 */
export function rankRecent(usage: UsageMap, leaves: NavLeaf[], now: number, limit = 3, excludeHrefs: string[] = []): NavLeaf[] {
  const byHref = new Map(leaves.map((l) => [l.href, l]))
  return Object.entries(usage)
    .filter(([href]) => byHref.has(href) && !excludeHrefs.includes(href))
    .sort(([, a], [, b]) => usageScore(b, now) - usageScore(a, now))
    .slice(0, limit)
    .map(([href]) => byHref.get(href)!)
}

/** Parses stored usage defensively (corrupt / foreign data → empty). */
export function parseUsage(raw: string | null): UsageMap {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const out: UsageMap = {}
    for (const [href, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value && typeof value === "object" && typeof (value as UsageEntry).count === "number" && typeof (value as UsageEntry).last === "number") {
        out[href] = { count: (value as UsageEntry).count, last: (value as UsageEntry).last }
      }
    }
    return out
  } catch {
    return {}
  }
}
