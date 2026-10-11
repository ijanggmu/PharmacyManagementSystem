"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { Bell, Package, Calendar, FileText, RotateCcw, RefreshCw, X } from "lucide-react"
import Link from "next/link"
import {
  deleteNotification,
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
}

const inboxQueryKey = ["notifications", "unread", 20] as const

export default function NotificationDropdown({
  lowStockCount,
  expiringCount,
  pendingCount,
  pendingReturnsCount = 0,
  pendingRefundsCount = 0,
}: NotificationDropdownProps) {
  const totalNotifications =
    lowStockCount + expiringCount + pendingCount + pendingReturnsCount + pendingRefundsCount

  const queryClient = useQueryClient()
  const inbox = useQuery({
    queryKey: inboxQueryKey,
    queryFn: () => listUnreadNotifications(20),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const items: NotificationItem[] = inbox.data ?? []
  const loading = inbox.isLoading
  const removeFromInbox = (id: string) =>
    queryClient.setQueryData<NotificationItem[]>(inboxQueryKey, (prev) => (prev ?? []).filter((n) => n.id !== id))

  // The id rides through mutate(arg) so overlapping clicks never act on the wrong row.
  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (_data, id) => removeFromInbox(id),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: (_data, id) => removeFromInbox(id),
  })
  // Clears the persisted inbox only. The live counts above are derived from current stock and pending
  // work, so they stay until the underlying condition is resolved.
  const clearInbox = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => queryClient.setQueryData<NotificationItem[]>(inboxQueryKey, []),
  })

  const badgeCount = totalNotifications + items.length
  const bellLabel = badgeCount > 0 ? `Notifications, ${badgeCount} new` : "Notifications, none new"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label={bellLabel}>
          <Bell className="w-4 h-4" aria-hidden />
          {badgeCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full px-1 flex items-center justify-center text-xs"
              aria-hidden
            >
              {badgeCount > 99 ? "99+" : badgeCount}
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
                  <FileText className="w-4 h-4 text-info" />
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
                <Link href="/dashboard/returns?view=refunds" className="flex items-center space-x-2">
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
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-medium">{n.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.is_read && (
                      <button
                        className="text-[10px] text-info hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          markRead.mutate(n.id)
                        }}
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      aria-label="Delete notification"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove.mutate(n.id)
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground line-clamp-2">
                  {n.message}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </DropdownMenuItem>
            ))}
            {items.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    clearInbox.mutate()
                  }}
                  disabled={clearInbox.isPending}
                  className="text-muted-foreground"
                >
                  Clear notifications
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
