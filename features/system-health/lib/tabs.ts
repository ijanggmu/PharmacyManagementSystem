export const HEALTH_TABS = ["overview", "modules", "services", "jobs", "migrations", "ird"] as const
export type HealthTab = (typeof HEALTH_TABS)[number]

export interface TabAccess {
  canViewPlatform: boolean
  canViewIrd: boolean
}

/** Tabs the viewer may open, in display order. Readiness-based tabs are open to anyone who can see the page. */
export function availableTabs({ canViewPlatform, canViewIrd }: TabAccess): HealthTab[] {
  return HEALTH_TABS.filter((tab) => {
    if (tab === "jobs" || tab === "migrations") return canViewPlatform
    if (tab === "ird") return canViewIrd
    return true
  })
}

/** Normalises a ?tab= value: unknown or forbidden tabs fall back to "overview". */
export function resolveTab(requested: string | null | undefined, allowed: readonly HealthTab[]): HealthTab {
  const match = allowed.find((t) => t === requested)
  return match ?? "overview"
}
