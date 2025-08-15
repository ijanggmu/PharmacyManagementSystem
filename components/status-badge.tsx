"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CheckCircle, Clock, AlertTriangle, XCircle } from "lucide-react"

interface StatusBadgeProps {
  status: "success" | "pending" | "warning" | "error"
  text: string
  icon?: boolean
  pulse?: boolean
  className?: string
}

export default function StatusBadge({ status, text, icon = true, pulse = false, className }: StatusBadgeProps) {
  const statusConfig = {
    success: {
      variant: "default" as const,
      className: "bg-green-100 text-green-800 border-green-200 hover:bg-green-200",
      icon: CheckCircle,
    },
    pending: {
      variant: "secondary" as const,
      className: "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200",
      icon: Clock,
    },
    warning: {
      variant: "outline" as const,
      className: "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200",
      icon: AlertTriangle,
    },
    error: {
      variant: "destructive" as const,
      className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200",
      icon: XCircle,
    },
  }

  const config = statusConfig[status]
  const IconComponent = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "status-indicator flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all duration-200",
        config.className,
        pulse && "animate-pulse",
        className,
      )}
    >
      {icon && <IconComponent className="h-3 w-3" />}
      {text}
    </Badge>
  )
}
