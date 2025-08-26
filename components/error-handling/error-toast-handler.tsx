"use client"

import { useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

interface ErrorToastHandlerProps {
  error: Error
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorToastHandler({ error, onRetry, onDismiss }: ErrorToastHandlerProps) {
  const { toast } = useToast()

  useEffect(() => {
    toast({
      title: getErrorTitle(error),
      description: error.message || "An unexpected error occurred",
      variant: "destructive",
      duration: 5000,
      action: onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="w-3 h-3 mr-1" />
          Retry
        </Button>
      ) : undefined,
    })

    return () => {
      if (onDismiss) {
        onDismiss()
      }
    }
  }, [error, onRetry, onDismiss, toast])

  return null
}

function getErrorTitle(error: Error): string {
  if (error.name === "ValidationError") {
    return "Validation Error"
  }
  if (error.name === "NetworkError" || error.message.includes("network")) {
    return "Connection Error"
  }
  if (error.name === "AuthenticationError" || error.message.includes("auth")) {
    return "Authentication Required"
  }
  if (error.name === "AuthorizationError" || error.message.includes("permission")) {
    return "Access Denied"
  }
  return "Error"
}

// Hook for easy error toast handling
export function useErrorToast() {
  const { toast } = useToast()

  const showErrorToast = (error: Error, onRetry?: () => void) => {
    toast({
      title: getErrorTitle(error),
      description: error.message || "An unexpected error occurred",
      variant: "destructive",
      duration: 5000,
      action: onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="w-3 h-3 mr-1" />
          Retry
        </Button>
      ) : undefined,
    })
  }

  return { showErrorToast }
}
