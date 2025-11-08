"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
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
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

import { createClient } from "@/lib/supabase/client"
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut"
import { useRouter } from "next/navigation"

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
  const [notifications, setNotifications] = useState({
    lowStock: 0,
    expiring: 0,
    pending: 0,
    pendingReturns: 0,
    pendingRefunds: 0,
  })
  const [userInfo, setUserInfo] = useState<{ name: string; role: string; initials: string } | null>(null)
  const pathname = usePathname()

  // Fetch user information
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          const { data: userData } = await supabase
            .from("users")
            .select("full_name, role")
            .eq("id", user.id)
            .single()
          
          if (userData) {
            const fullName = userData.full_name || user.email?.split('@')[0] || 'User'
            const initials = fullName
              .split(' ')
              .map(n => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
            
            const roleDisplay = userData.role 
              ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1)
              : 'User'
            
            setUserInfo({
              name: fullName,
              role: roleDisplay,
              initials
            })
          } else {
            // Fallback if user data not found
            const emailName = user.email?.split('@')[0] || 'User'
            setUserInfo({
              name: emailName,
              role: 'User',
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

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home, badge: null },
    {
      name: "Inventory",
      href: "/dashboard/inventory",
      icon: Package,
      badge:
        notifications.lowStock + notifications.expiring > 0
          ? (notifications.lowStock + notifications.expiring).toString()
          : null,
    },
    { name: "Customers", href: "/dashboard/customers", icon: Users, badge: null },
    {
      name: "Prescriptions",
      href: "/dashboard/prescriptions",
      icon: FileText,
      badge: notifications.pending > 0 ? notifications.pending.toString() : null,
    },
    { name: "Sales", href: "/dashboard/sales", icon: ShoppingCart, badge: null },
    { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck, badge: null },
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
    { name: "Reports", href: "/dashboard/reports", icon: BarChart3, badge: null },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, badge: null },
  ]

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
          "flex-1 space-y-1 py-6 transition-all duration-300 overflow-y-auto",
          !mobile && !sidebarExpanded ? "px-2" : "px-4",
        )}
      >
        {navigation.map((item) => {
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
              title={!mobile && !sidebarExpanded ? item.name : undefined}
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
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>

          <div className="flex-1" />

          <NotificationDropdown
            lowStockCount={notifications.lowStock}
            expiringCount={notifications.expiring}
            pendingCount={notifications.pending}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => {
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.href = '/auth/login'
              }}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
