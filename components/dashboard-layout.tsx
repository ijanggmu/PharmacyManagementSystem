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
  RefreshCw,
  RotateCcw,
  User,
  Activity,
  Building2,
  GitBranch,
  Keyboard,
  MapPin,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

import { createClient } from "@/lib/supabase/client"
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut"
import { useOfflineSalesSync } from "@/lib/hooks/use-offline-sales-sync"
import { useRouter } from "next/navigation"
import { AppTour, ModuleTour, resetTour } from "@/components/app-tour"
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog"

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
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
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
  const pathname = usePathname()
  const { pendingCount } = useOfflineSalesSync()

  // Fetch user information
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
              setUserId(user.id)
          const { data: userData } = await supabase
            .from("users")
            .select("full_name, role, tenant_id")
            .eq("id", user.id)
            .single()

          if (userData) {
            const fullName = userData.full_name || user.email?.split('@')[0] || 'User'
            const initials = fullName
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
            const rawRole = userData.role || 'user'
            const roleDisplay = userData.role 
              ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1)
              : 'User'

            setUserInfo({
              name: fullName,
              role: roleDisplay,
              rawRole,
              initials
            })

            // Load tenant information and plan for header badge
            if (userData.tenant_id) {
              const [{ data: tenant }, { data: subscriptions }] = await Promise.all([
                supabase
                  .from("tenants")
                  .select("name, country")
                  .eq("id", userData.tenant_id)
                  .single(),
                supabase
                  .from("tenant_subscriptions")
                  .select("plan_id, status, valid_from, plans!inner(code)")
                  .eq("tenant_id", userData.tenant_id)
                  .order("valid_from", { ascending: false }),
              ]).catch(() => [{ data: null }, { data: null }] as any)

              const activeSub = Array.isArray(subscriptions)
                ? subscriptions.find((s: any) => s.status === "active" || s.status === "trial") || subscriptions[0]
                : null

              setTenantInfo(
                tenant
                  ? {
                      name: tenant.name,
                      country: tenant.country,
                      planCode: activeSub?.plans?.code,
                    }
                  : null,
              )
            }
          } else {
            // Fallback if user data not found
            const emailName = user.email?.split('@')[0] || 'User'
            setUserInfo({
              name: emailName,
              role: 'User',
              rawRole: 'user',
              initials: emailName.slice(0, 2).toUpperCase()
            })
          }
        }
      } catch (error) {
        console.error("Error fetching user info:", error)
      }
    }
    
    fetchUserInfo()
  }, [])

  // Fetch notification counts
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const supabase = createClient()
        const currentDate = new Date()
        const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

        const [medicinesResult, prescriptionsResult, returnsResult, refundsResult] = await Promise.all([
          supabase.from("medicines").select("stock_quantity, minimum_stock, expiry_date"),
          supabase.from("prescriptions").select("status"),
          supabase.from("medicine_returns").select("status"),
          supabase.from("sales_refunds").select("refund_status"),
        ])

        if (medicinesResult.error || prescriptionsResult.error) {
          console.warn("[v0] Error fetching notifications:", medicinesResult.error || prescriptionsResult.error)
          return
        }

        const medicines = medicinesResult.data || []
        const prescriptions = prescriptionsResult.data || []
        const returns = returnsResult.data || []
        const refunds = refundsResult.data || []

        const lowStockCount = medicines.filter((med: any) => med.stock_quantity <= med.minimum_stock).length
        const expiringCount = medicines.filter((med: any) => {
          if (!med.expiry_date) return false
          const expiryDate = new Date(med.expiry_date)
          return expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
        }).length
        const pendingCount = prescriptions.filter((p: any) => p.status === "pending").length
        const pendingReturnsCount = returns.filter((r: any) => r.status === "pending").length
        const pendingRefundsCount = refunds.filter((r: any) => r.refund_status === "pending").length

        setNotifications({
          lowStock: lowStockCount,
          expiring: expiringCount,
          pending: pendingCount,
          pendingReturns: pendingReturnsCount,
          pendingRefunds: pendingRefundsCount,
        })
      } catch (error) {
        console.warn("[v0] Error in fetchNotifications:", error)
      }
    }

    fetchNotifications()
  }, [])

  // Organized navigation with logical grouping
  const navigation = [
    // Main Operations
    { name: "Dashboard", href: "/dashboard", icon: Home, badge: null, group: "main" },
    { name: "Sales", href: "/dashboard/sales", icon: ShoppingCart, badge: null, group: "main" },
    {
      name: "Prescriptions",
      href: "/dashboard/prescriptions",
      icon: FileText,
      badge: notifications.pending > 0 ? notifications.pending.toString() : null,
      group: "main",
      roles: ["admin", "pharmacist"],
    },
    
    // Inventory Management
    {
      name: "Inventory",
      href: "/dashboard/inventory",
      icon: Package,
      badge:
        notifications.lowStock + notifications.expiring > 0
          ? (notifications.lowStock + notifications.expiring).toString()
          : null,
      group: "inventory",
    },
    { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck, badge: null, group: "inventory" },
    
    // Customer Management
    { name: "Customers", href: "/dashboard/customers", icon: Users, badge: null, group: "customers" },
    
    // Returns & Refunds
    {
      name: "Returns",
      href: "/dashboard/returns",
      icon: RotateCcw,
      badge: notifications.pendingReturns > 0 ? notifications.pendingReturns.toString() : null,
      group: "operations",
    },
    {
      name: "Refunds",
      href: "/dashboard/refunds",
      icon: RefreshCw,
      badge: notifications.pendingRefunds > 0 ? notifications.pendingRefunds.toString() : null,
      group: "operations",
    },
    
    // Reports & Settings
    { name: "Reports", href: "/dashboard/reports", icon: BarChart3, badge: null, group: "admin", roles: ["admin"] },
    {
      name: "System Health",
      href: "/dashboard/system-health",
      icon: Activity,
      badge: null,
      group: "admin",
      roles: ["admin"],
    },
    {
      name: "IRD Reports",
      href: "/dashboard/reports/ird",
      icon: BarChart3,
      badge: null,
      group: "admin",
      roles: ["admin"],
    },
    {
      name: "Audit Logs",
      href: "/dashboard/reports/audit-logs",
      icon: FileText,
      badge: null,
      group: "admin",
      roles: ["admin"],
    },
    {
      name: "Narcotic Register",
      href: "/dashboard/reports/dda-narcotic",
      icon: FileText,
      badge: null,
      group: "admin",
      roles: ["admin", "pharmacist"],
    },
    { name: "Branches", href: "/dashboard/branches", icon: GitBranch, badge: null, group: "admin", roles: ["admin"] },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, badge: null, group: "admin", roles: ["admin"] },
    { name: "Tenants", href: "/dashboard/tenants", icon: Building2, badge: null, group: "admin", roles: ["superadmin"] },
  ]
 
  const currentRole = userInfo?.rawRole || "user"

  const isItemVisibleForRole = (item: any) => {
    if (!item.roles || item.roles.length === 0) return true
    return item.roles.includes(currentRole)
  }

  // Group navigation items after role filtering
  const groupedNavigation = {
    main: navigation.filter((item) => item.group === "main" && isItemVisibleForRole(item)),
    inventory: navigation.filter((item) => item.group === "inventory" && isItemVisibleForRole(item)),
    customers: navigation.filter((item) => item.group === "customers" && isItemVisibleForRole(item)),
    operations: navigation.filter((item) => item.group === "operations" && isItemVisibleForRole(item)),
    admin: navigation.filter((item) => item.group === "admin" && isItemVisibleForRole(item)),
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      className={cn(
        "flex h-full flex-col bg-background border-r transition-all duration-300",
        !mobile && !sidebarExpanded && "w-16",
        !mobile && sidebarExpanded && "w-72",
      )}
      onMouseEnter={() => !mobile && setSidebarExpanded(true)}
      onMouseLeave={() => !mobile && setSidebarExpanded(false)}
    >
      <Link
        href="/dashboard"
        className={cn(
          "flex h-16 shrink-0 items-center border-b transition-all duration-300 cursor-pointer hover:bg-accent/50",
          !mobile && !sidebarExpanded ? "px-3 justify-center" : "px-6 gap-3",
        )}
      >
        <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg shrink-0">
          <Pill className="h-5 w-5 text-primary-foreground" />
        </div>
        {(mobile || sidebarExpanded) && (
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">PharmaCare</h1>
            <p className="text-xs text-muted-foreground truncate">Management System</p>
          </div>
        )}
      </Link>

      <nav
        className={cn(
          "flex-1 space-y-4 py-6 transition-all duration-300 overflow-y-auto",
          !mobile && !sidebarExpanded ? "px-2" : "px-4",
        )}
      >
        {/* Render grouped navigation */}
        {Object.entries(groupedNavigation).map(([groupName, items]) => (
          <div key={groupName} className="space-y-1">
            {(mobile || sidebarExpanded) && items.length > 0 && (
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {groupName === "main" && "Operations"}
                {groupName === "inventory" && "Inventory"}
                {groupName === "customers" && "Customers"}
                {groupName === "operations" && "Returns & Refunds"}
                {groupName === "admin" && "Administration"}
              </div>
            )}
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => mobile && setSidebarOpen(false)}
                  className={cn(
                    "group flex items-center rounded-md text-sm font-medium transition-colors relative",
                    !mobile && !sidebarExpanded ? "px-3 py-3 justify-center" : "px-3 py-2.5 gap-3",
                    isActive 
                      ? "bg-primary/10 text-primary font-semibold" 
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  title={
                    !mobile && !sidebarExpanded
                      ? item.name === "Sales"
                        ? "Sales (Ctrl+K or ⌘K to open POS)"
                        : item.name
                      : undefined
                  }
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                  )}
                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0", 
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground"
                    )}
                  />
                  {(mobile || sidebarExpanded) && (
                    <>
                      <span className="flex-1 truncate">{item.name}</span>
                      {item.badge && (
                        <Badge 
                          variant={isActive ? "default" : "secondary"} 
                          className="text-xs shrink-0"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
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
