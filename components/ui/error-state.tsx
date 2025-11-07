/**
 * Standardized Error State Component
 * Provides consistent error displays across the application
 */

import { cn } from "@/lib/utils"
import { AlertCircle } from "lucide-react"
import { Button } from "./button"

interface ErrorStateProps {
  title?: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className
      )}
    >
      <AlertCircle className="mb-4 h-8 w-8 text-destructive" />
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{message}</p>
      {action && (
        <Button variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

