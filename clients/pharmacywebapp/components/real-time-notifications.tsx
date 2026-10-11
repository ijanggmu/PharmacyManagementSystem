"use client"

import { useState, useEffect } from "react"
import { Bell, X, AlertTriangle, Clock, Package, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// ScrollArea component not available, using div instead
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { medicinesApi } from "@/features/medicines/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"

interface Notification {
  id: string
  type: "low_stock" | "expiring" | "expired" | "prescription_pending" | "system"
  title: string
  message: string
  created_at: string
  read: boolean
  priority: "low" | "medium" | "high"
}

export default function RealTimeNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadNotifications()

    // Check for low stock medicines
    const checkLowStock = async () => {
      const { data: medicines } = await medicinesApi.getMedicines({ limit: 1000 })

      if (medicines) {
        const lowStockList = medicines.filter((m: any) => m.stock_quantity <= m.minimum_stock)
        const lowStockNotifications = lowStockList.map((medicine: any) => ({
          id: `low_stock_${medicine.id}`,
          type: "low_stock" as const,
          title: "Low Stock Alert",
          message: `${medicine.name} is running low (${medicine.stock_quantity} remaining)`,
          created_at: new Date().toISOString(),
          read: false,
          priority: medicine.stock_quantity === 0 ? ("high" as const) : ("medium" as const),
        }))

        setNotifications((prev) => {
          const existing = prev.filter((n) => !n.id.startsWith("low_stock_"))
          return [...existing, ...lowStockNotifications]
        })
      }
    }

    // Check for expiring medicines
    const checkExpiringMedicines = async () => {
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      const { data: medicines } = await medicinesApi.getMedicines({ limit: 1000 })

      if (medicines) {
        const now = new Date()
        const expiringList = medicines.filter((medicine: any) => {
          if (!medicine.expiry_date) return false
          const date = new Date(medicine.expiry_date)
          return date <= thirtyDaysFromNow && date >= now
        })
        const expiringNotifications = expiringList.map((medicine: any) => ({
          id: `expiring_${medicine.id}`,
          type: "expiring" as const,
          title: "Medicine Expiring Soon",
          message: `${medicine.name} expires on ${new Date(medicine.expiry_date).toLocaleDateString()}`,
          created_at: new Date().toISOString(),
          read: false,
          priority: "medium" as const,
        }))

        setNotifications((prev) => {
          const existing = prev.filter((n) => !n.id.startsWith("expiring_"))
          return [...existing, ...expiringNotifications]
        })
      }
    }

    // Check for pending prescriptions
    const checkPendingPrescriptions = async () => {
      const { data: prescriptions } = await prescriptionsApi.getPrescriptions({ status: "pending", limit: 1000 })

      if (prescriptions) {
        const pendingNotifications = prescriptions.map((prescription: any) => ({
          id: `pending_${prescription.id}`,
          type: "prescription_pending" as const,
          title: "Pending Prescription",
          message: `Prescription ${prescription.prescription_number} for ${prescription.customers?.first_name} ${prescription.customers?.last_name} needs attention`,
          created_at: new Date().toISOString(),
          read: false,
          priority: "high" as const,
        }))

        setNotifications((prev) => {
          const existing = prev.filter((n) => !n.id.startsWith("pending_"))
          return [...existing, ...pendingNotifications]
        })
      }
    }

    // Initial checks
    checkLowStock()
    checkExpiringMedicines()
    checkPendingPrescriptions()

    // Set up periodic checks
    const interval = setInterval(() => {
      checkLowStock()
      checkExpiringMedicines()
      checkPendingPrescriptions()
    }, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setUnreadCount(notifications.filter((n) => !n.read).length)
  }, [notifications])

  const loadNotifications = async () => {
    // In a real app, you'd load from a notifications table
    // For now, we'll generate them based on current data
  }

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "low_stock":
        return <Package className="h-4 w-4 text-orange-500" />
      case "expiring":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "expired":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "prescription_pending":
        return <AlertTriangle className="h-4 w-4 text-info" />
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getPriorityColor = (priority: Notification["priority"]) => {
    switch (priority) {
      case "high":
        return "border-l-red-500 bg-red-50"
      case "medium":
        return "border-l-yellow-500 bg-yellow-50"
      case "low":
        return "border-l-info bg-info/5"
      default:
        return "border-l-border bg-muted/40"
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Notifications</CardTitle>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-6 text-xs">
                  Mark all read
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  No notifications
                </div>
              ) : (
                <div className="space-y-1">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 border-l-4 cursor-pointer hover:bg-accent ${getPriorityColor(notification.priority)} ${
                        !notification.read ? "bg-opacity-100" : "bg-opacity-50"
                      }`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2 flex-1">
                          {getNotificationIcon(notification.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-sm font-medium ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}
                              >
                                {notification.title}
                              </p>
                              {!notification.read && <div className="w-2 h-2 bg-primary rounded-full"></div>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(notification.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            dismissNotification(notification.id)
                          }}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}
