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

// Status is conveyed by icon + text + color, so it survives color-blindness and grayscale printing.
const statusConfig = {
  success: { variant: "success" as const, icon: CheckCircle },
  pending: { variant: "info" as const, icon: Clock },
  warning: { variant: "warning" as const, icon: AlertTriangle },
  error: { variant: "danger" as const, icon: XCircle },
}

export default function StatusBadge({ status, text, icon = true, pulse = false, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  const IconComponent = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "status-indicator gap-1 px-2 py-0.5 text-xs font-medium",
        pulse && "motion-safe:animate-pulse",
        className,
      )}
    >
      {icon && <IconComponent className="h-3 w-3" aria-hidden />}
      {text}
    </Badge>
  )
}
