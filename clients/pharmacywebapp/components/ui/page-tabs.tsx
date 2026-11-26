"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { buildTabHref, resolveTabValue, scrollDeltaToReveal } from "@/lib/utils/page-tabs"

/**
 * One page-level tab bar for the whole app: a horizontally scrolling underline strip that never clips or
 * overflows its container (fade edges show there is more), keeps the active tab in view, and keeps Radix's
 * keyboard model (arrow keys / Home / End move between tabs). Optionally mirrors the tab in the URL.
 *
 *   <PageTabs label="Settings sections" param="tab" defaultValue="users" items={[...]}>
 *     <TabsContent value="users">…</TabsContent>
 *   </PageTabs>
 *
 * Where a layout already owns the `Tabs` root (and its own URL contract), render just the strip with
 * `<PageTabsBar value=… items=… label=… />` inside that root.
 */

export interface PageTabItem<T extends string = string> {
  value: T
  label: React.ReactNode
  /** Rendered element, e.g. `<Users aria-hidden />` (an element, so Server Components can pass it). */
  icon?: React.ReactNode
  /** Trailing count/badge, e.g. `<PageTabCount count={3} label="settlements" />`. */
  badge?: React.ReactNode
  /** Leave the tab out entirely (e.g. the user lacks the permission). A URL asking for it falls back. */
  hidden?: boolean
  disabled?: boolean
}

export interface PageTabsBarProps<T extends string = string> {
  items: readonly PageTabItem<T>[]
  /** The active tab, so the strip can scroll it into view. */
  value: string | undefined
  /** Accessible name of the tab list. */
  label: string
  className?: string
  /** Keep the strip at the top of the page while it scrolls. */
  sticky?: boolean
}

/** Small count chip for a tab; tinted on the active tab. */
export function PageTabCount({ count, label, display }: { count: number; label: string; display?: React.ReactNode }) {
  return (
    <span
      className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium text-muted-foreground group-data-[state=active]/page-tab:bg-primary/10 group-data-[state=active]/page-tab:text-primary"
      aria-label={`${count} ${label}`}
    >
      {display ?? count}
    </span>
  )
}

/**
 * Segmented control: a soft track with the active tab lifted onto it as a white chip (icon in the brand colour).
 * Reads as "you are here" at a glance, is shorter than an underlined row, and works the same in every module.
 */
const TRACK_CLASS =
  "h-auto w-max gap-0.5 rounded-xl border border-border/70 bg-muted/60 p-1 shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)]"

const TRIGGER_CLASS = cn(
  "relative h-8 flex-none gap-1.5 rounded-lg border-0 bg-transparent px-3 text-[13px] font-medium text-muted-foreground",
  "transition-[color,background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
  "hover:bg-background/70 hover:text-foreground",
  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--color-border)]",
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-card",
  "[&_svg]:size-4 [&_svg]:text-muted-foreground data-[state=active]:[&_svg]:text-primary",
  // Overflow clips an outer ring, so draw the focus ring inside the trigger.
  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
)

/**
 * The bar sticks to the top of the scrolling page, so switching tab (or period) never means scrolling back up.
 * The negative margins match the dashboard shell's page gutter, so content passes cleanly underneath.
 */
export const STICKY_BAR_CLASS = cn(
  "sticky z-20 -mx-4 border-b border-border/60 bg-background px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
  // Stick at minus the shell's top padding (main: py-6, lg:py-8) so the stuck bar sits flush with the visible
  // top edge and nothing scrolls past above it.
  "-top-6 lg:-top-8",
)


export function PageTabsBar<T extends string = string>({ items, value, label, className, sticky = false }: PageTabsBarProps<T>) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })
  const visible = items.filter((item) => !item.hidden)
  const visibleKey = visible.map((item) => item.value).join("|")

  const measure = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [measure, visibleKey])

  // Keep the active tab fully visible (deep links, keyboard moves, a tab chosen from elsewhere on the page).
  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el || !value) return
    const active = el.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    if (!active) return
    const delta = scrollDeltaToReveal(el.getBoundingClientRect(), active.getBoundingClientRect())
    if (delta === 0) return
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollBy({ left: delta, behavior: reduceMotion ? "auto" : "smooth" })
  }, [value, visibleKey])

  if (visible.length === 0) return null

  return (
    <div className={cn("relative min-w-0 max-w-full", sticky && STICKY_BAR_CLASS, className)}>
      <div
        ref={scrollerRef}
        onScroll={measure}
        className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList aria-label={label} className={TRACK_CLASS}>
          {visible.map((item) => (
            <TabsTrigger key={item.value} value={item.value} disabled={item.disabled} className={TRIGGER_CLASS}>
              {item.icon}
              {item.label}
              {item.badge}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity duration-150 motion-reduce:transition-none",
          edges.start ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-150 motion-reduce:transition-none",
          edges.end ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}

/**
 * Tab state kept in a search param (`?tab=` by default) via `router.replace(…, { scroll: false })`, so a
 * tab can be linked to and survives a refresh without stacking history entries. Unknown or hidden values
 * fall back to `defaultValue` (or the first tab), and the default tab drops the param.
 *
 * The switch shows at once; the URL catches up behind it. Needs a Suspense boundary above it on a
 * statically prerendered page (useSearchParams); `PageTabs` adds one for you.
 */
export function usePageTabParam<T extends string>(
  values: readonly T[],
  options?: { param?: string; defaultValue?: T },
): [T | undefined, (next: string) => void] {
  const param = options?.param ?? "tab"
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get(param)
  const defaultValue = resolveTabValue(undefined, values, options?.defaultValue)
  const fromUrl = resolveTabValue(raw, values, defaultValue)

  // Optimistic value until the URL reflects it; any URL change (incl. back/forward) wins again.
  const [pending, setPending] = React.useState<T | null>(null)
  const [seenRaw, setSeenRaw] = React.useState(raw)
  if (seenRaw !== raw) {
    setSeenRaw(raw)
    setPending(null)
  }
  const active = pending !== null && values.includes(pending) ? pending : fromUrl

  const valuesKey = values.join("|")
  const setActive = React.useCallback(
    (next: string) => {
      const value = values.find((v) => v === next)
      if (!value || !pathname) return
      setPending(value)
      // The live query, so params another control wrote moments ago survive.
      const search = typeof window === "undefined" ? searchParams.toString() : window.location.search
      router.replace(buildTabHref(pathname, search, param, value, defaultValue), { scroll: false })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valuesKey, pathname, searchParams, router, param, defaultValue],
  )

  return [active, setActive]
}

export interface PageTabsProps<T extends string = string> {
  items: readonly PageTabItem<T>[]
  /** Accessible name of the tab list. */
  label: string
  /** Controlled value (use with `onValueChange`). Ignored when `param` is set. */
  value?: T
  /** Initial tab when uncontrolled, and the default tab (no param in the URL) when `param` is set. */
  defaultValue?: T
  onValueChange?: (value: T) => void
  /** Mirror the tab in this search param (`true` = "tab"). */
  param?: string | true
  /** Root classes; defaults to a gap between the strip and the panels. */
  className?: string
  barClassName?: string
  /** Keep the strip at the top while the page scrolls (default on: page-level tabs). */
  sticky?: boolean
  /** The `TabsContent` panels. */
  children: React.ReactNode
}

function PageTabsView<T extends string>({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
  className,
  barClassName,
  sticky = true,
  children,
}: Omit<PageTabsProps<T>, "param">) {
  const visibleValues = items.filter((item) => !item.hidden).map((item) => item.value)
  const fallback = resolveTabValue(undefined, visibleValues, defaultValue)
  const [local, setLocal] = React.useState<T | undefined>(fallback)
  const controlled = value !== undefined
  const current = controlled ? resolveTabValue(value, visibleValues, fallback) : resolveTabValue(local, visibleValues, fallback)

  const handleChange = (next: string) => {
    const match = visibleValues.find((v) => v === next)
    if (!match) return
    if (!controlled) setLocal(match)
    onValueChange?.(match)
  }

  return (
    <Tabs value={current ?? ""} onValueChange={handleChange} className={cn("min-w-0 gap-3", className)}>
      <PageTabsBar items={items} value={current} label={label} className={barClassName} sticky={sticky} />
      {children}
    </Tabs>
  )
}

function SyncedPageTabs<T extends string>({ param, ...props }: PageTabsProps<T> & { param: string }) {
  const visibleValues = props.items.filter((item) => !item.hidden).map((item) => item.value)
  const [active, setActive] = usePageTabParam(visibleValues, { param, defaultValue: props.defaultValue })
  return (
    <PageTabsView
      {...props}
      value={active}
      onValueChange={(next) => {
        setActive(next)
        props.onValueChange?.(next)
      }}
    />
  )
}

export function PageTabs<T extends string = string>({ param, ...props }: PageTabsProps<T>) {
  if (!param) return <PageTabsView {...props} />
  const name = param === true ? "tab" : param
  return (
    // useSearchParams suspends while a static page prerenders; show the default tab until then.
    <React.Suspense fallback={<PageTabsView {...props} value={undefined} />}>
      <SyncedPageTabs {...props} param={name} />
    </React.Suspense>
  )
}
