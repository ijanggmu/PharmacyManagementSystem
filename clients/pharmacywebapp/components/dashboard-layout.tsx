"use client"

import type React from "react"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Button, buttonVariants } from "@/components/ui/button"
import { EnhancedErrorBoundary } from "@/components/error-handling/enhanced-error-boundary"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import NotificationDropdown from "@/components/notification-dropdown"
import { BranchSwitcher } from "@/components/branch-switcher"
import {
  Plus,
  Menu,
  Home,
  Package,
  Users,
  FileText,
  ShoppingCart,
  BarChart3,
  Settings,
  LogOut,
  Truck,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  ArrowLeftRight,
  RotateCcw,
  User,
  Activity,
  Building2,
  GitBranch,
  Keyboard,
  MapPin,
  BookOpen,
  Banknote,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ListOrdered,
  BookMarked,
  Scale,
  FileSpreadsheet,
  Wallet,
  Receipt,
  Link2,
  Landmark,
  AlertTriangle,
  HandCoins,
  Search,
  WifiOff,
  UserPlus,
  FilePlus2,
  LifeBuoy,
  Globe2,
  CreditCard,
  LayoutDashboard,
  HeartPulse,
  ScrollText,
  History,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BrandLogo, BrandMark } from "@/components/brand/brand-mark"
import {
  parseUsage,
  rankRecent,
  recordVisit,
  resolveActiveHref,
  visibleSections,
  type NavLeaf,
  type NavSection,
  type UsageMap,
  type VisibilityCheck,
} from "@/components/navigation/nav-model"
import { ThemeToggle } from "@/components/theme/theme-toggle"

import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut"
import { useOfflineSalesSync } from "@/features/sales/hooks/use-offline-sales-sync"
import { useRouter } from "next/navigation"
import { AppTour, ModuleTour, resetTour } from "@/components/app-tour"
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog"
import { dashboardApi } from "@/features/dashboard/api-client"
import { currentUserQueryKey, useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { loadDotnetCurrentUser, signOutWithDotnet } from "@/lib/api/auth-api"
import { CommandPalette, type PaletteLink } from "@/components/command-palette"
import { dotnetPermissionAllowed, isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { canManageBranches } from "@/lib/api/branches-api"
import { canViewApprovalsLog } from "@/features/approvals/lib/approval"
import { canViewTickets, canViewTicketsAcrossTenants } from "@/lib/api/tickets-api"
import type { Permission } from "@/lib/security/rbac-types"

interface DashboardLayoutProps {
  children: React.ReactNode
}

/**
 * The shell is mounted once by app/dashboard/layout.tsx and persists across navigations, so the
 * sidebar, header and user context never reload. Pages still wrap themselves in the default
 * export below; inside the shell that wrapper is a pass-through.
 */
const ShellContext = createContext(false)

export const dashboardShellContextQueryKey = ["dashboard", "shell-context"] as const

const EMPTY_SHELL_COUNTS = { lowStock: 0, expiring: 0, pending: 0, pendingReturns: 0, pendingRefunds: 0 }

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const insideShell = useContext(ShellContext)
  if (insideShell) return <>{children}</>
  return <DashboardShell>{children}</DashboardShell>
}

export function DashboardShell({ children }: DashboardLayoutProps) {
  const router = useRouter()
  
  // Keyboard shortcut for new sales (Ctrl+K or Cmd+K)
  useKeyboardShortcut("k", () => {
    router.push("/dashboard/sales/new")
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [tourForceOpen, setTourForceOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const branchAccess = useBranchAccess()
  // Shares the cache with useBranchAccess, so the profile is fetched once.
  const currentUser = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  // Sidebar badges and the bell's live counts (low stock, expiring, pending Rx/returns/refunds). Keyed by
  // the current branch so a branch switch shows that branch's counts, and polled so a sale or receipt
  // elsewhere doesn't leave them stale for the whole session.
  const shellContext = useQuery({
    queryKey: [...dashboardShellContextQueryKey, branchAccess.currentBranchId ?? "default"],
    queryFn: async () => {
      const { data, error } = await dashboardApi.getContext()
      if (error || !data) throw new Error(error ?? "Failed to load dashboard context")
      return data
    },
    // Wait for the branch context so the first fetch already uses the right key (no double request).
    enabled: !branchAccess.isLoading,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  })
  const notifications = shellContext.data?.notifications ?? EMPTY_SHELL_COUNTS
  const userInfo = shellContext.data?.user ?? currentUser.data?.info ?? null
  const userId = shellContext.data?.user.id ?? currentUser.data?.id ?? null
  const tenantInfo = shellContext.data?.tenant ?? null
  const branchCount = shellContext.data?.branchCount ?? 1
  const pathname = usePathname()
  const { pendingCount, failedCount } = useOfflineSalesSync()

  // Restore the user's last sidebar preference (defaults to expanded)
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-expanded")
    if (stored !== null) setSidebarExpanded(stored === "true")
  }, [])

  const toggleSidebar = () => {
    setSidebarExpanded((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-expanded", String(next))
      return next
    })
  }

  // Navigation, grouped by the job being done. Visibility comes from the signed-in user's .NET
  // permission claims (the same array the backend enforces): `permission` names one or more legacy
  // keys resolved through dotnetPermissionAllowed (any one grants), `check` is the escape hatch for
  // items with no legacy equivalent. Omitting both = always visible. A SuperAdmin holds every root
  // permission, so the bypass falls out of the checks themselves. Routes merged into tabbed pages are
  // listed under `match` so their old URLs (now redirects) and sub-flows still highlight the item.
  const lowStockAndExpiring = notifications.lowStock + notifications.expiring
  const pendingReturnsAndRefunds = notifications.pendingReturns + notifications.pendingRefunds
  const permissions = userInfo?.permissions ?? []
  const hasAccounting = dotnetPermissionAllowed("accounting:read", permissions)
  const count = (n: number) => (n > 0 ? n.toString() : null)

  const navSections: NavSection[] = [
    { id: "home", items: [{ name: "Dashboard", href: "/dashboard", icon: Home, exact: true }] },
    {
      id: "sell",
      label: "Sell",
      items: [
        { name: "Sales history", href: "/dashboard/sales", icon: ShoppingCart, permission: "sales:read" },
        {
          name: "Returns & refunds",
          href: "/dashboard/returns",
          icon: RotateCcw,
          match: ["/dashboard/refunds"],
          badge: count(pendingReturnsAndRefunds),
          permission: "sales:read",
        },
        // Closing a cash shift is a write action (admin/manager/cashier).
        { name: "Cashier / Z-Out", href: "/dashboard/cashier", icon: Banknote, permission: "sales:write" },
        { name: "Customers", href: "/dashboard/customers", icon: Users, permission: "customers:read" },
      ],
    },
    {
      id: "pharmacy",
      label: "Pharmacy",
      items: [
        { name: "Prescriptions", href: "/dashboard/prescriptions", icon: FileText, badge: count(notifications.pending), permission: "prescriptions:read" },
        { name: "Narcotic register", href: "/dashboard/reports/dda-narcotic", icon: ShieldCheck, permission: "reports:read" },
      ],
    },
    {
      id: "stock",
      label: "Stock",
      items: [
        { name: "Medicines", href: "/dashboard/inventory", icon: Package, badge: count(lowStockAndExpiring), permission: "inventory:read" },
        { name: "Stock movements", href: "/dashboard/inventory/movements", icon: Activity, permission: "inventory:read" },
        { name: "Expiry & recalls", href: "/dashboard/inventory/expired", icon: AlertTriangle, permission: "inventory:read" },
        // Stock transfers move stock between branches — pointless with only one.
        ...(branchCount > 1
          ? [{ name: "Transfers", href: "/dashboard/stock-transfers", icon: ArrowLeftRight, permission: "inventory:write" } satisfies NavLeaf]
          : []),
        { name: "Consignment", href: "/dashboard/inventory/consignment", icon: HandCoins, permission: "inventory:write" },
        { name: "Stock counts", href: "/dashboard/inventory/stock-counts", icon: ClipboardCheck, permission: "inventory:write" },
      ],
    },
    {
      id: "purchasing",
      label: "Purchasing",
      items: [
        { name: "Purchases", href: "/dashboard/purchases", icon: ClipboardList, permission: "inventory:write" },
        { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck, permission: "suppliers:read", exact: true },
        { name: "Expiry claims", href: "/dashboard/suppliers/expiry-claims", icon: FileWarning, permission: "suppliers:read" },
      ],
    },
    {
      id: "finance",
      label: "Finance",
      icon: Landmark,
      collapsible: true,
      permission: "accounting:read",
      items: [
        { name: "Overview", href: "/dashboard/reports/accounting", icon: LayoutDashboard, exact: true },
        {
          name: "Vouchers & ledger",
          href: "/dashboard/reports/accounting/register",
          icon: ListOrdered,
          match: ["/dashboard/reports/accounting/ledger", "/dashboard/reports/accounting/journal"],
        },
        { name: "Expenses", href: "/dashboard/expenses", icon: Receipt },
        {
          name: "Cash & bank",
          href: "/dashboard/reports/accounting/cash",
          icon: Wallet,
          match: ["/dashboard/reports/accounting/bank-reconciliation"],
        },
        {
          name: "Receivables & payables",
          href: "/dashboard/reports/accounting/receivables",
          icon: Scale,
          match: ["/dashboard/reports/accounting/payables"],
        },
        {
          name: "Statements",
          href: "/dashboard/reports/accounting/statements",
          icon: FileSpreadsheet,
          match: ["/dashboard/reports/accounting/trial-balance", "/dashboard/reports/accounting/reconciliation"],
        },
        { name: "Tax & IRD", href: "/dashboard/reports/accounting/vat", icon: Link2 },
      ],
    },
    {
      id: "insights",
      label: "Insights",
      items: [
        { name: "Reports", href: "/dashboard/reports", icon: BarChart3, exact: true, permission: "reports:read" },
        { name: "Dead stock", href: "/dashboard/reports/dead-stock", icon: Package, permission: "reports:read" },
        // IRD lives under Finance → Tax & IRD; users with reports but no accounting access keep the
        // standalone page here.
        ...(!hasAccounting
          ? [{ name: "IRD reports", href: "/dashboard/reports/ird", icon: FileText, permission: "reports:read" } satisfies NavLeaf]
          : []),
        { name: "Audit log", href: "/dashboard/reports/audit-logs", icon: BookMarked, permission: "reports:read" },
        { name: "Approvals log", href: "/dashboard/reports/approvals", icon: ShieldCheck, check: canViewApprovalsLog },
      ],
    },
    {
      id: "admin",
      label: "Admin",
      items: [
        { name: "Settings", href: "/dashboard/settings", icon: Settings, exact: true, permission: ["settings:read", "users:read"] },
        // No standalone "view" permission — Branches.Manage is the only control (canManageBranches).
        { name: "Branches", href: "/dashboard/branches", icon: GitBranch, check: canManageBranches },
        {
          name: "Finance setup",
          href: "/dashboard/reports/accounting/chart-of-accounts",
          icon: BookOpen,
          match: ["/dashboard/settings/opening-balances"],
          permission: "accounting:read",
        },
        {
          name: "System health",
          href: "/dashboard/system-health",
          icon: HeartPulse,
          // Mirrors the page's own gate: platform checks (Tenants.View, root) or the IRD queue.
          check: (p) => isDotnetRootUser(p) || p.includes("Permissions.Tenants.View") || p.includes("Permissions.Sales.Ird.View"),
        },
        // Same gate as the System Logs page (AuditTrails.View).
        { name: "System logs", href: "/dashboard/settings/system-logs", icon: ScrollText, check: (p) => isDotnetRootUser(p) || p.includes("Permissions.AuditTrails.View") },
      ],
    },
    {
      // Super-admin tools for running the platform — kept apart from the pharmacy's own admin.
      id: "platform",
      label: "Platform",
      icon: Globe2,
      collapsible: true,
      tone: "platform",
      items: [
        // Root-only (Permissions.Tenants.View) — same gate as the pages themselves.
        { name: "Tenants", href: "/dashboard/tenants", icon: Building2, permission: "tenants:read" },
        { name: "Billing", href: "/dashboard/tenants/billing", icon: CreditCard, permission: "tenants:read" },
        { name: "All tenants' tickets", href: "/dashboard/tickets/all-tenants", icon: Globe2, check: canViewTicketsAcrossTenants },
      ],
    },
  ]

  // Footer: occasional-use support desk, out of the daily menu.
  const helpLink: NavLeaf = { name: "Help & support", href: "/dashboard/tickets", icon: LifeBuoy, check: canViewTickets }

  const isNodeVisible: VisibilityCheck = (node) => {
    if (node.check) return node.check(permissions)
    if (!node.permission) return true
    const required = Array.isArray(node.permission) ? node.permission : [node.permission]
    return required.length === 0 || required.some((permission) => dotnetPermissionAllowed(permission, permissions))
  }

  const sections = visibleSections(navSections, isNodeVisible)
  const showHelp = isNodeVisible(helpLink)
  const allLeaves = [...sections.flatMap((s) => s.items), ...(showHelp ? [helpLink] : [])]
  const activeHref = resolveActiveHref(pathname, allLeaves)

  const palettePages: PaletteLink[] = sections.flatMap((s) =>
    s.items.map((i) => ({ name: i.name, href: i.href, icon: i.icon, group: s.label })),
  )
  if (showHelp) palettePages.push({ name: helpLink.name, href: helpLink.href, icon: helpLink.icon })
  const paletteActions: PaletteLink[] = [
    { name: "New sale", href: "/dashboard/sales/new", icon: ShoppingCart, shortcut: "Ctrl K", keywords: ["pos", "bill", "invoice", "checkout"] },
    { name: "Add medicine", href: "/dashboard/inventory?action=create", icon: Package, keywords: ["product", "stock", "item"] },
    ...(dotnetPermissionAllowed("prescriptions:write", permissions)
      ? [{ name: "New prescription", href: "/dashboard/prescriptions/add", icon: FilePlus2, keywords: ["rx", "doctor"] }]
      : []),
    { name: "Add customer", href: "/dashboard/customers?action=create", icon: UserPlus, keywords: ["patient", "client"] },
    { name: "New return", href: "/dashboard/returns/new", icon: RotateCcw },
    { name: "My profile", href: "/dashboard/profile", icon: User },
  ]

  // ---- Collapsible sections (Finance, Platform) ----------------------------------------------
  // Remembered per browser. Accountants get Finance open by default; everyone gets the section
  // holding the current page opened automatically.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())
  const sectionsLoaded = useRef(false)
  useEffect(() => {
    if (sectionsLoaded.current || !userInfo) return
    sectionsLoaded.current = true
    let stored: string[] | null = null
    try {
      const raw = localStorage.getItem("pharmacare.nav-open-sections")
      stored = raw ? (JSON.parse(raw) as string[]) : null
    } catch {
      stored = null
    }
    const isAccountant = /account|finance/i.test(`${userInfo.rawRole} ${userInfo.role}`)
    setOpenSections(new Set(stored ?? (isAccountant ? ["finance"] : [])))
  }, [userInfo])

  const setSectionOpen = (id: string, open: boolean) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      try {
        localStorage.setItem("pharmacare.nav-open-sections", JSON.stringify([...next]))
      } catch {
        // Blocked storage: the choice still applies for this session.
      }
      return next
    })
  }

  // Auto-open the collapsible section that contains the current page.
  useEffect(() => {
    const holder = sections.find((s) => s.collapsible && s.items.some((i) => i.href === activeHref))
    if (holder && !openSections.has(holder.id)) setOpenSections((prev) => new Set(prev).add(holder.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHref])

  // ---- Recently used --------------------------------------------------------------------------
  // Per user, per browser (a convenience, not shared data): the 3 pages this person opens most,
  // recency-weighted, shown at the top once there's enough history to be useful.
  const usageKey = userId ? `pharmacare.nav-usage.v1:${userId}` : null
  const [usage, setUsage] = useState<UsageMap>({})
  useEffect(() => {
    if (!usageKey) return
    try {
      setUsage(parseUsage(localStorage.getItem(usageKey)))
    } catch {
      setUsage({})
    }
  }, [usageKey])
  useEffect(() => {
    if (!usageKey || !activeHref) return
    setUsage((prev) => {
      const next = recordVisit(prev, activeHref, Date.now())
      try {
        localStorage.setItem(usageKey, JSON.stringify(next))
      } catch {
        // Blocked storage: recents just won't persist.
      }
      return next
    })
  }, [usageKey, activeHref])
  const recent = rankRecent(usage, allLeaves, Date.now(), 3, ["/dashboard", activeHref ?? ""])

  // The shell persists across navigations, so reset the content scroll on each new page
  // (query-string changes such as filters keep their position).
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  // Remount the error boundary per module so one page's crash doesn't follow you around,
  // without resetting nested layout state (e.g. accounting filters) on sub-page changes.
  const moduleKey = pathname.split("/")[2] ?? "home"

  const itemBase =
    "group relative flex items-center rounded-lg text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
  const itemActive = "bg-card text-foreground shadow-xs ring-1 ring-sidebar-border"
  const itemIdle = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"

  const navBadge = (value: string | number, active: boolean) => (
    <span
      className={cn(
        "num ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
        active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
      )}
    >
      {value}
    </span>
  )

  const renderLeaf = (item: NavLeaf, opts: { mobile: boolean; rail: boolean; keyPrefix?: string }) => {
    const isActive = item.href === activeHref
    return (
      <Link
        key={(opts.keyPrefix ?? "") + item.href}
        href={item.href}
        onClick={() => opts.mobile && setSidebarOpen(false)}
        aria-current={isActive ? "page" : undefined}
        aria-label={opts.rail ? item.name : undefined}
        title={opts.rail ? item.name : undefined}
        className={cn(itemBase, opts.rail ? "mx-auto size-10 justify-center" : "h-9 gap-2.5 px-2.5", isActive ? itemActive : itemIdle)}
      >
        <item.icon
          aria-hidden
          className={cn("size-[18px] shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
        />
        {!opts.rail && <span className="flex-1 truncate">{item.name}</span>}
        {!opts.rail && item.badge && navBadge(item.badge, isActive)}
        {opts.rail && item.badge && (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
        )}
      </Link>
    )
  }

  // Rendered via renderSidebar(...) rather than <Sidebar />: a component declared inside
  // another component is a new type every render, which remounts the nav and resets its scroll.
  const renderSidebar = ({ mobile = false }: { mobile?: boolean } = {}) => {
    const rail = !mobile && !sidebarExpanded
    return (
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out motion-reduce:transition-none",
          !mobile && (rail ? "w-[68px]" : "w-60"),
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center", rail ? "justify-center px-2" : "px-4")}>
          <Link
            href="/dashboard"
            onClick={() => mobile && setSidebarOpen(false)}
            aria-label={rail ? "PharmaCare — dashboard" : undefined}
            className="-m-1 flex min-w-0 items-center rounded-lg p-1 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {rail ? <BrandMark className="size-7" /> : <BrandLogo subtitle={tenantInfo?.name ?? "Pharmacy workspace"} />}
          </Link>
        </div>

        {/* The counter's most frequent action, always one click away. */}
        {dotnetPermissionAllowed("sales:write", permissions) && (
          <div className={cn("shrink-0 px-3 pb-2", rail && "flex justify-center")}>
            <Link
              href="/dashboard/sales/new"
              onClick={() => mobile && setSidebarOpen(false)}
              aria-label={rail ? "New sale" : undefined}
              title={rail ? "New sale (Ctrl+K)" : "Open point of sale (Ctrl+K)"}
              aria-current={pathname === "/dashboard/sales/new" ? "page" : undefined}
              className={cn(
                buttonVariants({ size: rail ? "icon" : "default" }),
                rail ? "size-10" : "h-9 w-full justify-start gap-2.5 px-2.5",
              )}
            >
              <Plus className="size-[18px]" aria-hidden />
              {!rail && (
                <>
                  <span className="flex-1 text-left">New sale</span>
                  <kbd className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 font-mono text-[10px] font-medium">
                    Ctrl K
                  </kbd>
                </>
              )}
            </Link>
          </div>
        )}

        <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-1">
          {!rail && recent.length >= 2 && (
            <div className="mb-3 animate-fade-in">
              <p className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                <History className="size-3" aria-hidden />
                Recent
              </p>
              <div className="space-y-0.5">{recent.map((item) => renderLeaf(item, { mobile, rail, keyPrefix: "recent-" }))}</div>
            </div>
          )}

          {sections.map((section, index) => {
            const isOpen = !section.collapsible || openSections.has(section.id)
            const sectionActive = section.items.some((i) => i.href === activeHref)
            const sectionBadge = section.items.reduce((sum, i) => sum + (i.badge ? Number(i.badge) || 0 : 0), 0)

            return (
              <div key={section.id} className={cn(index > 0 && "mt-3", section.tone === "platform" && !rail && "mt-4 border-t border-dashed border-sidebar-border pt-3")}>
                {/* Section heading: a plain label, or a toggle for collapsible sections. Hidden in the rail. */}
                {section.label && !rail && !section.collapsible && (
                  <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{section.label}</p>
                )}
                {section.label && !rail && section.collapsible && (
                  <button
                    type="button"
                    onClick={() => setSectionOpen(section.id, !isOpen)}
                    aria-expanded={isOpen}
                    className="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    <span className={cn("flex-1 text-left", sectionActive && !isOpen && "text-primary")}>{section.label}</span>
                    {!isOpen && sectionBadge > 0 && navBadge(sectionBadge, false)}
                    <ChevronRight className={cn("size-3.5 transition-transform duration-200 ease-out", isOpen && "rotate-90")} aria-hidden />
                  </button>
                )}
                {rail && index > 0 && <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden />}

                {rail && section.collapsible ? (
                  // Collapsed rail: one icon for the whole section; clicking expands the sidebar on it.
                  <button
                    type="button"
                    onClick={() => {
                      toggleSidebar()
                      setSectionOpen(section.id, true)
                    }}
                    aria-label={`${section.label} (expand sidebar)`}
                    title={section.label}
                    className={cn(itemBase, "mx-auto size-10 cursor-pointer justify-center", sectionActive ? itemActive : itemIdle)}
                  >
                    {section.icon && (
                      <section.icon
                        aria-hidden
                        className={cn("size-[18px] shrink-0", sectionActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                      />
                    )}
                    {sectionBadge > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />}
                  </button>
                ) : (
                  // grid-rows 0fr→1fr animates to the content's real height (no max-height guess).
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                    inert={!isOpen}
                  >
                    <div className="min-h-0 space-y-0.5 overflow-hidden">{section.items.map((item) => renderLeaf(item, { mobile, rail }))}</div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className={cn("shrink-0 space-y-0.5 border-t border-sidebar-border p-3", rail && "flex flex-col items-center")}>
          {showHelp && renderLeaf(helpLink, { mobile, rail })}
          {!mobile && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-pressed={sidebarExpanded}
              title={rail ? "Expand sidebar" : undefined}
              className={cn(
                itemBase,
                "cursor-pointer text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                rail ? "size-10 justify-center" : "h-9 w-full gap-2.5 px-2.5",
              )}
            >
              {sidebarExpanded ? (
                <PanelLeftClose className="size-[18px] shrink-0" aria-hidden />
              ) : (
                <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden />
              )}
              {!rail && <span>Collapse</span>}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <ShellContext.Provider value={true}>
      <div className="flex h-dvh bg-sidebar">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col">{renderSidebar()}</aside>

        {/* Mobile Sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 gap-0 border-r-0 bg-sidebar p-0">
            {renderSidebar({ mobile: true })}
          </SheetContent>
        </Sheet>

        {/* Main panel — inset card on desktop, full-bleed on mobile */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:my-2 lg:mr-2 lg:rounded-xl lg:border lg:shadow-xs">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-6">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-1 lg:hidden" aria-label="Open navigation menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
            </Sheet>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="group flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-[color,border-color] duration-150 hover:border-input hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:max-w-xs md:max-w-sm"
                aria-label="Search pages and actions"
                aria-keyshortcuts="/ Control+Shift+K"
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Search or jump to…</span>
                <kbd className="ml-auto hidden h-5 items-center rounded border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground md:inline-flex">
                  /
                </kbd>
              </button>
              {tenantInfo?.planCode && (
                <Badge variant="muted" className="hidden shrink-0 uppercase tracking-wide xl:inline-flex" title={`Plan: ${tenantInfo.planCode}`}>
                  {tenantInfo.planCode}
                </Badge>
              )}
              {tenantInfo && <BranchSwitcher />}
            </div>

            {pendingCount > 0 && (
              <Badge
                variant="warning"
                className="hidden gap-1.5 py-1 sm:inline-flex"
                role="status"
                title="These sales were recorded offline and will sync automatically when the connection returns."
              >
                <WifiOff aria-hidden />
                {pendingCount} offline {pendingCount === 1 ? "sale" : "sales"} to sync
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge
                variant="danger"
                className="hidden gap-1.5 py-1 sm:inline-flex"
                role="status"
                title="The server rejected these offline sales. Open the point of sale to retry or discard them."
              >
                <WifiOff aria-hidden />
                {failedCount} offline {failedCount === 1 ? "sale" : "sales"} failed
              </Badge>
            )}

            <div className="flex items-center gap-0.5">
              <ThemeToggle />
              <NotificationDropdown
                lowStockCount={notifications.lowStock}
                expiringCount={notifications.expiring}
                pendingCount={notifications.pending}
                pendingReturnsCount={notifications.pendingReturns}
                pendingRefundsCount={notifications.pendingRefunds}
              />
            </div>

            <div className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative size-9 rounded-full p-0 hover:bg-transparent" aria-label="Open user menu">
                  <Avatar className="size-8 ring-1 ring-border transition-shadow duration-150 hover:ring-2 hover:ring-primary/30">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {userInfo?.initials || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-3 py-0.5">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {userInfo?.initials || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight">{userInfo?.name || "User"}</p>
                      <p className="truncate text-xs capitalize leading-tight text-muted-foreground">
                        {userInfo?.role || "User"}
                        {tenantInfo?.name ? ` · ${tenantInfo.name}` : ""}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <User className="mr-2 size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShortcutsDialogOpen(true)}>
                  <Keyboard className="mr-2 size-4" />
                  Keyboard shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    resetTour(userId)
                    setTourForceOpen(true)
                  }}
                >
                  <MapPin className="mr-2 size-4" />
                  Restart tour
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={async () => {
                    await signOutWithDotnet()
                    window.location.href = "/?auth=signin"
                  }}
                >
                  <LogOut className="mr-2 size-4 text-destructive" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 [scrollbar-gutter:stable] focus:outline-none sm:px-6 lg:px-8 lg:py-8"
          >
            <div className="mx-auto max-w-7xl">
              <EnhancedErrorBoundary key={moduleKey} level="component">
                {children}
              </EnhancedErrorBoundary>
            </div>
          </main>
        </div>

        <AppTour
          forceOpen={tourForceOpen}
          onClose={() => setTourForceOpen(false)}
          role={userInfo?.rawRole}
          userId={userId}
        />
        {/* Module-specific micro-tours */}
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="sales" pathPrefix="/dashboard/sales" />
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="inventory" pathPrefix="/dashboard/inventory" />
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="prescriptions" pathPrefix="/dashboard/prescriptions" />
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="customers" pathPrefix="/dashboard/customers" />
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="returns" pathPrefix="/dashboard/returns" />
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="reports" pathPrefix="/dashboard/reports" />
        <ModuleTour userId={userId} role={userInfo?.rawRole} context="tenants" pathPrefix="/dashboard/tenants" />
        <KeyboardShortcutsDialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} actions={paletteActions} pages={palettePages} />
      </div>
    </ShellContext.Provider>
  )
}
