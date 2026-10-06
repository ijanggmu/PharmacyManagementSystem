import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Bell, Package, Calendar, FileText, RotateCcw, RefreshCw } from "lucide-react"
import Link from "next/link"
import {
  listUnreadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notifications-api"

interface NotificationDropdownProps {
  lowStockCount: number
  expiringCount: number
  pendingCount: number
  pendingReturnsCount?: number
  pendingRefundsCount?: number
  onClearAll?: () => void
}

export default function NotificationDropdown({
  lowStockCount,
  expiringCount,
  pendingCount,
  pendingReturnsCount = 0,
  pendingRefundsCount = 0,
  onClearAll,
}: NotificationDropdownProps) {
  const totalNotifications =
    lowStockCount + expiringCount + pendingCount + pendingReturnsCount + pendingRefundsCount

  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setItems(await listUnreadNotifications(20))
      } catch {
        // ignore errors in dropdown
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setItems((prev) => prev.filter((n) => n.id !== id))
    } catch {
      // ignore
    }
  }

  const handleClearAll = async () => {
    try {
      await markAllNotificationsRead()
      setItems([])
      onClearAll?.()
    } catch {
      // ignore
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {totalNotifications > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {totalNotifications}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Live summary notifications (computed) */}
        {totalNotifications > 0 && (
          <>
            {lowStockCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/inventory" className="flex items-center space-x-2">
                  <Package className="w-4 h-4 text-orange-600" />
                  <span>{lowStockCount} medicines are low in stock</span>
                </Link>
              </DropdownMenuItem>
            )}
            {expiringCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/inventory" className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span>{expiringCount} medicines expiring soon</span>
                </Link>
              </DropdownMenuItem>
            )}
            {pendingCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/prescriptions" className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>{pendingCount} prescriptions pending</span>
                </Link>
              </DropdownMenuItem>
            )}
            {pendingReturnsCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/returns" className="flex items-center space-x-2">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>{pendingReturnsCount} returns pending review</span>
                </Link>
              </DropdownMenuItem>
            )}
            {pendingRefundsCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/refunds" className="flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-rose-600" />
                  <span>{pendingRefundsCount} refunds pending review</span>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Persistent notifications list */}
        {loading ? (
          <DropdownMenuItem disabled>Loading notifications...</DropdownMenuItem>
        ) : items.length === 0 && totalNotifications === 0 ? (
          <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
        ) : (
          <>
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-1"
                onSelect={(e) => {
                  e.preventDefault()
                  if (n.link) {
                    window.location.href = n.link
                  }
                }}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-medium">{n.title}</span>
                  {!n.is_read && (
                    <button
                      className="text-[10px] text-blue-600 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMarkRead(n.id)
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground line-clamp-2">
                  {n.message}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </DropdownMenuItem>
            ))}
            {(onClearAll || items.length > 0 || totalNotifications > 0) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    handleClearAll()
                  }}
                  className="text-muted-foreground"
                >
                  Clear all
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
