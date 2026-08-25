"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
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
  Pill,
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
  ClipboardList,
  ArrowLeftRight,
  RefreshCw,
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
  ChevronDown,
  ListOrdered,
  PlusCircle,
  BookMarked,
  Scale,
  FileSpreadsheet,
  Wallet,
  Receipt,
  Link2,
  Landmark,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

import { createClient } from "@/lib/supabase/client"
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut"
import { useOfflineSalesSync } from "@/features/sales/hooks/use-offline-sales-sync"
import { useRouter } from "next/navigation"
import { AppTour, ModuleTour, resetTour } from "@/components/app-tour"
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog"
import { dashboardApi } from "@/features/dashboard/api-client"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  
  // Keyboard shortcut for new sales (Ctrl+K or Cmd+K)
  useKeyboardShortcut("k", () => {
    router.push("/dashboard/sales/new")
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [tourForceOpen, setTourForceOpen] = useState(false)
  const [notifications, setNotifications] = useState({
    lowStock: 0,
    expiring: 0,
    pending: 0,
    pendingReturns: 0,
    pendingRefunds: 0,
  })
  const [userInfo, setUserInfo] = useState<{
    name: string
    role: string
    rawRole: string
    initials: string
  } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [tenantInfo, setTenantInfo] = useState<{
    name: string
    country?: string
    planCode?: string
  } | null>(null)
  const [branchCount, setBranchCount] = useState(1)
  const pathname = usePathname()
  const { pendingCount } = useOfflineSalesSync()

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

  // Fetch user information
  useEffect(() => {
    const fetchDashboardContext = async () => {
      try {
        const { data, error } = await dashboardApi.getContext()
        if (error || !data) return
        setUserId(data.user.id)
        setUserInfo({
          name: data.user.name,
          role: data.user.role,
          rawRole: data.user.rawRole,
          initials: data.user.initials,
        })
        setTenantInfo(data.tenant)
        setNotifications(data.notifications)
        setBranchCount(data.branchCount)
      } catch (error) {
        console.error("Error fetching user info:", error)
      }
    }
    
    fetchDashboardContext()
  }, [])

  // Parent/child navigation tree. Leaf items link directly; group items expand to
  // reveal children. Role visibility is checked per-node (a group also needs at
  // least one role-visible child to render at all).
  interface NavLeaf {
    name: string
    href: string
    icon: LucideIcon
    badge?: string | null
    roles?: string[]
  }
  interface NavGroup {
    name: string
    icon: LucideIcon
    roles?: string[]
    children: NavLeaf[]
  }
  type NavNode = ({ kind: "link" } & NavLeaf) | ({ kind: "group" } & NavGroup)

  const lowStockAndExpiring = notifications.lowStock + notifications.expiring

  const navigationTree: NavNode[] = [
    { kind: "link", name: "Dashboard", href: "/dashboard", icon: Home },
    {
      kind: "group",
      name: "Sales",
      icon: ShoppingCart,
      children: [
        { name: "Sales", href: "/dashboard/sales", icon: ShoppingCart },
        {
          name: "Cashier / Z-Out",
          href: "/dashboard/cashier",
          icon: Banknote,
          roles: ["admin", "manager", "cashier"],
        },
      ],
    },
    {
      kind: "link",
      name: "Prescriptions",
      href: "/dashboard/prescriptions",
      icon: FileText,
      badge: notifications.pending > 0 ? notifications.pending.toString() : null,
      roles: ["admin", "pharmacist"],
    },
    {
      kind: "group",
      name: "Inventory",
      icon: Package,
      children: [
        {
          name: "Medicines",
          href: "/dashboard/inventory",
          icon: Package,
          badge: lowStockAndExpiring > 0 ? lowStockAndExpiring.toString() : null,
        },
        { name: "Purchases", href: "/dashboard/purchases", icon: ClipboardList, roles: ["admin", "manager"] },
        { name: "Expired Stock", href: "/dashboard/inventory/expired", icon: AlertTriangle, roles: ["admin", "manager", "pharmacist"] },
        { name: "Movement History", href: "/dashboard/inventory/movements", icon: Activity, roles: ["admin", "manager", "pharmacist"] },
        // Stock transfers move stock between branches — pointless with only one.
        ...(branchCount > 1
          ? [
              {
                name: "Stock Transfers",
                href: "/dashboard/stock-transfers",
                icon: ArrowLeftRight,
                roles: ["admin", "manager", "pharmacist"],
              } as NavLeaf,
            ]
          : []),
        { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
      ],
    },
    { kind: "link", name: "Customers", href: "/dashboard/customers", icon: Users },
    {
      kind: "group",
      name: "Returns & Refunds",
      icon: RotateCcw,
      children: [
        {
          name: "Returns",
          href: "/dashboard/returns",
          icon: RotateCcw,
          badge: notifications.pendingReturns > 0 ? notifications.pendingReturns.toString() : null,
        },
        {
          name: "Refunds",
          href: "/dashboard/refunds",
          icon: RefreshCw,
          badge: notifications.pendingRefunds > 0 ? notifications.pendingRefunds.toString() : null,
        },
      ],
    },
    {
      kind: "group",
      name: "Accounting",
      icon: BookOpen,
      roles: ["admin", "manager", "superadmin"],
      children: [
        { name: "Voucher Register", href: "/dashboard/reports/accounting/register", icon: ListOrdered },
        { name: "New Journal Entry", href: "/dashboard/reports/accounting/journal", icon: PlusCircle },
        { name: "General Ledger", href: "/dashboard/reports/accounting/ledger", icon: BookMarked },
        { name: "Trial Balance", href: "/dashboard/reports/accounting/trial-balance", icon: Scale },
        { name: "Chart of Accounts", href: "/dashboard/reports/accounting/chart-of-accounts", icon: BookOpen },
        { name: "Expenses", href: "/dashboard/expenses", icon: Receipt },
        { name: "Financial Statements", href: "/dashboard/reports/accounting/statements", icon: FileSpreadsheet },
        { name: "Payables", href: "/dashboard/reports/accounting/payables", icon: Wallet },
        { name: "Receivables", href: "/dashboard/reports/accounting/receivables", icon: Users },
        { name: "VAT Return", href: "/dashboard/reports/accounting/vat", icon: Receipt },
        { name: "Reconciliation", href: "/dashboard/reports/accounting/reconciliation", icon: Link2 },
        { name: "Cash & Bank", href: "/dashboard/reports/accounting/cash", icon: Landmark },
      ],
    },
    {
      kind: "group",
      name: "Reports",
      icon: BarChart3,
      roles: ["admin"],
      children: [
        { name: "Overview", href: "/dashboard/reports", icon: BarChart3 },
        { name: "Dead Stock", href: "/dashboard/reports/dead-stock", icon: Package },
        { name: "IRD Reports", href: "/dashboard/reports/ird", icon: FileText },
        { name: "Narcotic Register", href: "/dashboard/reports/dda-narcotic", icon: FileText, roles: ["admin", "pharmacist"] },
        { name: "Audit Logs", href: "/dashboard/reports/audit-logs", icon: FileText },
        { name: "System Health", href: "/dashboard/system-health", icon: Activity },
      ],
    },
    {
      kind: "group",
      name: "Administration",
      icon: Settings,
      roles: ["admin", "superadmin"],
      children: [
        { name: "Branches", href: "/dashboard/branches", icon: GitBranch },
        { name: "Settings", href: "/dashboard/settings", icon: Settings },
        { name: "Tenants", href: "/dashboard/tenants", icon: Building2, roles: ["superadmin"] },
      ],
    },
  ]

  const currentRole = userInfo?.rawRole || "user"

  const isRoleVisible = (roles?: string[]) => !roles || roles.length === 0 || roles.includes(currentRole)

  // Resolve to what's actually visible for this user's role — a group only renders
  // if the group itself is role-visible AND at least one child survives filtering.
  const visibleNav = navigationTree
    .map((node) => {
      if (node.kind === "link") {
        return isRoleVisible(node.roles) ? node : null
      }
      if (!isRoleVisible(node.roles)) return null
      const children = node.children.filter((c) => isRoleVisible(c.roles))
      return children.length > 0 ? { ...node, children } : null
    })
    .filter((n): n is NavNode => n !== null)

  const basePath = (href: string) => href.split("?")[0]
  const isPathActive = (href: string) => pathname === basePath(href) || pathname.startsWith(basePath(href) + "/")

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // Auto-expand whichever group contains the current route.
  useEffect(() => {
    const active = navigationTree.find(
      (n) => n.kind === "group" && n.children.some((c) => isPathActive(c.href))
    )
    if (active) {
      setOpenGroups((prev) => (prev.has(active.name) ? prev : new Set(prev).add(active.name)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      className={cn(
        "flex h-full flex-col bg-background border-r transition-all duration-300",
        !mobile && !sidebarExpanded && "w-16",
        !mobile && sidebarExpanded && "w-72",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b transition-all duration-300",
          !mobile && !sidebarExpanded ? "px-3 justify-center" : "px-4 gap-3",
        )}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex min-w-0 flex-1 items-center rounded-md transition-all duration-300 hover:bg-accent/50",
            !mobile && !sidebarExpanded ? "justify-center p-1" : "gap-3 p-1",
          )}
        >
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg shrink-0">
            <Pill className="h-5 w-5 text-primary-foreground" />
          </div>
          <div
            className={cn(
              "min-w-0 overflow-hidden transition-all duration-300 ease-out",
              mobile || sidebarExpanded ? "max-w-[180px] opacity-100 translate-x-0 ml-0" : "max-w-0 opacity-0 -translate-x-2 ml-0"
            )}
          >
            <h1 className="text-lg font-semibold text-foreground truncate">PharmaCare</h1>
            <p className="text-xs text-muted-foreground truncate">Management System</p>
          </div>
        </Link>

        {!mobile && sidebarExpanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            aria-pressed={sidebarExpanded}
            className="h-9 w-9 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden />
          </Button>
        )}
      </div>

      {!mobile && !sidebarExpanded && (
        <div className="flex justify-center border-b py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
            aria-pressed={sidebarExpanded}
            className="h-9 w-9 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <PanelLeftOpen className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      )}

      <nav
        className={cn(
          "flex-1 space-y-1 py-4 transition-all duration-300 overflow-y-auto",
          !mobile && !sidebarExpanded ? "px-2" : "px-3",
        )}
      >
        {visibleNav.map((node) => {
          const collapsedRail = !mobile && !sidebarExpanded

          if (node.kind === "link") {
            const isActive = isPathActive(node.href)
            return (
              <Link
                key={node.name}
                href={node.href}
                onClick={() => mobile && setSidebarOpen(false)}
                className={cn(
                  "group flex items-center rounded-md text-sm font-medium transition-colors relative",
                  collapsedRail ? "px-3 py-3 justify-center" : "px-3 py-2.5 gap-3",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                title={collapsedRail ? (node.name === "Sales" ? "Sales (Ctrl+K or ⌘K to open POS)" : node.name) : undefined}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />}
                <node.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground")} />
                <span className={cn("flex-1 truncate overflow-hidden transition-all duration-300 ease-out", mobile || sidebarExpanded ? "max-w-[160px] opacity-100 translate-x-0" : "max-w-0 opacity-0 -translate-x-1")}>
                  {node.name}
                </span>
                {node.badge && (mobile || sidebarExpanded) && (
                  <Badge variant={isActive ? "default" : "secondary"} className="text-xs shrink-0">
                    {node.badge}
                  </Badge>
                )}
              </Link>
            )
          }

          // Group node
          const groupHasActiveChild = node.children.some((c) => isPathActive(c.href))
          const isOpen = openGroups.has(node.name) && (mobile || sidebarExpanded)
          const groupBadgeTotal = node.children.reduce((sum, c) => sum + (c.badge ? Number(c.badge) || 0 : 0), 0)

          return (
            <div key={node.name}>
              <button
                type="button"
                onClick={() => {
                  if (collapsedRail) {
                    toggleSidebar()
                    setOpenGroups((prev) => new Set(prev).add(node.name))
                    return
                  }
                  toggleGroup(node.name)
                }}
                aria-expanded={isOpen}
                className={cn(
                  "group flex w-full items-center rounded-md text-sm font-medium transition-colors relative cursor-pointer",
                  collapsedRail ? "px-3 py-3 justify-center" : "px-3 py-2.5 gap-3",
                  groupHasActiveChild
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                title={collapsedRail ? (node.name === "Sales" ? "Sales (Ctrl+K or ⌘K to open POS)" : node.name) : undefined}
              >
                {groupHasActiveChild && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />}
                <node.icon className={cn("h-5 w-5 shrink-0", groupHasActiveChild ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground")} />
                <span className={cn("flex-1 truncate text-left overflow-hidden transition-all duration-300 ease-out", mobile || sidebarExpanded ? "max-w-[140px] opacity-100 translate-x-0" : "max-w-0 opacity-0 -translate-x-1")}>
                  {node.name}
                </span>
                {(mobile || sidebarExpanded) && (
                  <>
                    {groupBadgeTotal > 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {groupBadgeTotal}
                      </Badge>
                    )}
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
                      aria-hidden
                    />
                  </>
                )}
              </button>

              {(mobile || sidebarExpanded) && (
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200 ease-out",
                    isOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="ml-4 mt-1 space-y-0.5 border-l pl-3">
                    {node.children.map((child) => {
                      const isActive = isPathActive(child.href)
                      return (
                        <Link
                          key={child.name}
                          href={child.href}
                          onClick={() => mobile && setSidebarOpen(false)}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          <child.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground")} />
                          <span className="flex-1 truncate">{child.name}</span>
                          {child.badge && (
                            <Badge variant={isActive ? "default" : "secondary"} className="text-xs shrink-0">
                              {child.badge}
                            </Badge>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col">
        <Sidebar />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <Sidebar mobile />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>

          <div className="flex flex-1 items-center gap-3 overflow-hidden">
            {tenantInfo && (
              <div className="flex items-center gap-3 min-w-0">
                <div className="hidden sm:flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {tenantInfo.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {tenantInfo.country || "Tenant"}{" "}
                    {tenantInfo.planCode ? `· Plan: ${tenantInfo.planCode}` : ""}
                  </span>
                </div>
                {tenantInfo.planCode && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {tenantInfo.planCode.toUpperCase()}
                  </Badge>
                )}
                <BranchSwitcher />
              </div>
            )}
          </div>

          {pendingCount > 0 && (
            <Badge variant="outline" className="text-xs mr-2">
              Offline sales pending: {pendingCount}
            </Badge>
          )}

          <NotificationDropdown
            lowStockCount={notifications.lowStock}
            expiringCount={notifications.expiring}
            pendingCount={notifications.pending}
            pendingReturnsCount={notifications.pendingReturns}
            pendingRefundsCount={notifications.pendingRefunds}
            onClearAll={() =>
              setNotifications({
                lowStock: 0,
                expiring: 0,
                pending: 0,
                pendingReturns: 0,
                pendingRefunds: 0,
              })
            }
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Open user menu">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {userInfo?.initials || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userInfo?.name || 'User'}</p>
                  <p className="text-xs leading-none text-muted-foreground capitalize">{userInfo?.role || 'User'}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShortcutsDialogOpen(true)}>
                <Keyboard className="mr-2 h-4 w-4" />
                Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  resetTour(userId)
                  setTourForceOpen(true)
                }}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Restart tour
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => {
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.href = '/?auth=signin'
              }}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main id="main-content" className="flex-1 overflow-auto p-6" role="main">
          <div className="mx-auto max-w-7xl">
            <EnhancedErrorBoundary level="component">
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
      <ModuleTour userId={userId} role={userInfo?.rawRole} context="refunds" pathPrefix="/dashboard/refunds" />
      <ModuleTour userId={userId} role={userInfo?.rawRole} context="reports" pathPrefix="/dashboard/reports" />
      <ModuleTour userId={userId} role={userInfo?.rawRole} context="tenants" pathPrefix="/dashboard/tenants" />
      <KeyboardShortcutsDialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen} />
    </div>
  )
}
