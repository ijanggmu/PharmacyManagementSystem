/**
 * Pure helpers behind `components/ui/page-tabs.tsx`: which tab a URL asks for, and the URL for switching
 * tabs. Kept free of React so they can be unit tested.
 */

/** The tab to show: the requested one if it is offered, else the fallback (if offered), else the first. */
export function resolveTabValue<T extends string>(
  raw: string | null | undefined,
  values: readonly T[],
  fallback?: T,
): T | undefined {
  const wanted = raw?.trim()
  const match = wanted ? values.find((v) => v === wanted) : undefined
  if (match) return match
  if (fallback !== undefined && values.includes(fallback)) return fallback
  return values[0]
}

/**
 * URL for switching tab: sets `param`, or drops it for the default tab, and keeps every other query
 * param (a page's own filters survive a tab switch).
 */
export function buildTabHref(
  pathname: string,
  search: string | URLSearchParams,
  param: string,
  value: string,
  defaultValue: string | undefined,
): string {
  const params = new URLSearchParams(search)
  if (value === defaultValue) params.delete(param)
  else params.set(param, value)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * How far to scroll a tab strip so a tab is fully visible, with `pad` px of breathing room (0 when it
 * already is). Rects are viewport-relative (getBoundingClientRect), so this works whatever the
 * offsetParent is.
 */
export function scrollDeltaToReveal(
  container: { left: number; right: number },
  item: { left: number; right: number },
  pad = 24,
): number {
  if (item.left < container.left + pad) return item.left - container.left - pad
  if (item.right > container.right - pad) return item.right - container.right + pad
  return 0
}
