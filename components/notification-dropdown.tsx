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
import { Bell, Package, Calendar, FileText } from "lucide-react"
import Link from "next/link"

interface NotificationDropdownProps {
  lowStockCount: number
  expiringCount: number
  pendingCount: number
}

export default function NotificationDropdown({
  lowStockCount,
  expiringCount,
  pendingCount,
}: NotificationDropdownProps) {
  const totalNotifications = lowStockCount + expiringCount + pendingCount

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

        {totalNotifications === 0 ? (
          <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
        ) : (
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
