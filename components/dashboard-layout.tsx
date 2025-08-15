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
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOut } from "@/lib/actions"
import { createClient } from "@/lib/supabase/client"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [notifications, setNotifications] = useState({
    lowStock: 0,
    expiring: 0,
    pending: 0,
  })
  const pathname = usePathname()

  // Fetch notification counts
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const supabase = createClient()
        const currentDate = new Date()
        const thirtyDaysFromNow = new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)

        const [medicinesResult, prescriptionsResult] = await Promise.all([
          supabase.from("medicines").select("stock_quantity, minimum_stock, expiry_date"),
          supabase.from("prescriptions").select("status"),
        ])

        if (medicinesResult.error || prescriptionsResult.error) {
          console.warn("[v0] Error fetching notifications:", medicinesResult.error || prescriptionsResult.error)
          return
        }

        const medicines = medicinesResult.data || []
        const prescriptions = prescriptionsResult.data || []

        const lowStockCount = medicines.filter((med) => med.stock_quantity <= med.minimum_stock).length
        const expiringCount = medicines.filter((med) => {
          if (!med.expiry_date) return false
          const expiryDate = new Date(med.expiry_date)
          return expiryDate <= thirtyDaysFromNow && expiryDate >= currentDate
        }).length
        const pendingCount = prescriptions.filter((p) => p.status === "pending").length

        setNotifications({
          lowStock: lowStockCount,
          expiring: expiringCount,
          pending: pendingCount,
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
    { name: "Reports", href: "/dashboard/reports", icon: BarChart3, badge: null },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, badge: null },
  ]

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      className={cn(
        "flex h-full flex-col bg-white border-r border-gray-200 transition-all duration-300",
        !mobile && !sidebarExpanded && "w-16",
        !mobile && sidebarExpanded && "w-72",
      )}
      onMouseEnter={() => !mobile && setSidebarExpanded(true)}
      onMouseLeave={() => !mobile && setSidebarExpanded(false)}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-gray-200 transition-all duration-300",
          !mobile && !sidebarExpanded ? "px-3 justify-center" : "px-6 gap-3",
        )}
      >
        <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
          <Pill className="h-5 w-5 text-white" />
        </div>
        {(mobile || sidebarExpanded) && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">PharmaCare</h1>
            <p className="text-xs text-gray-500">Management System</p>
          </div>
        )}
      </div>

      <nav
        className={cn(
          "flex-1 space-y-1 py-6 transition-all duration-300",
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
                "group flex items-center rounded-lg text-sm font-medium transition-colors",
                !mobile && !sidebarExpanded ? "px-3 py-3 justify-center" : "px-4 py-3 gap-3",
                isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
              )}
              title={!mobile && !sidebarExpanded ? item.name : undefined}
            >
              <item.icon
                className={cn("h-5 w-5", isActive ? "text-blue-600" : "text-gray-500 group-hover:text-gray-700")}
              />
              {(mobile || sidebarExpanded) && (
                <>
                  <span className="flex-1">{item.name}</span>
                  {item.badge && (
                    <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
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
    <div className="flex h-screen bg-gray-50">
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
        <header className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
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
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-semibold">JD</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">John Doe</p>
                  <p className="text-xs leading-none text-muted-foreground">Senior Pharmacist</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <form action={signOut} className="w-full">
                  <button type="submit" className="flex w-full items-center">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </button>
                </form>
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
