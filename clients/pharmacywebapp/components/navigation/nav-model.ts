import type { LucideIcon } from "lucide-react"
import type { Permission } from "@/lib/security/rbac-types"

/**
 * Sidebar model: sections of links, grouped by the job being done (Sell, Stock, Money…).
 * Pure helpers here (active-item resolution, permission filtering) are kept out of the shell component
 * so they can be unit-tested.
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
  /** Group heading; omitted for the top block (Dashboard), which never folds. Labelled groups fold (one open at a time). */
  label?: string
  /** Group icon: on the heading, and alone in the collapsed rail. */
  icon?: LucideIcon
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
