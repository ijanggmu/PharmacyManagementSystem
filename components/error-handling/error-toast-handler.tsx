"use client"

import { useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { PharmacyError } from "@/lib/error-handling/error-types"
import { ErrorRecoveryManager } from "@/lib/error-handling/error-recovery"
import { Button } from "@/components/ui/button"
import { RefreshCw, ExternalLink } from "lucide-react"

interface ErrorToastHandlerProps {
  error: PharmacyError
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorToastHandler({ error, onRetry, onDismiss }: ErrorToastHandlerProps) {
  const { toast } = useToast()
  const recoveryManager = ErrorRecoveryManager.getInstance()

  useEffect(() => {
    const recoveryActions = recoveryManager.getRecoveryActions(error)
    const primaryAction = recoveryActions.find((action) => action.primary)

    toast({
      title: getErrorTitle(error),
      description: error.userMessage,
      variant: getToastVariant(error),
      duration: error.severity === "CRITICAL" ? Number.POSITIVE_INFINITY : 5000,
      action: (
        <div className="flex gap-2">
          {onRetry && error.retryable && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          )}
          {primaryAction && primaryAction.label !== "Try Again" && (
            <Button size="sm" variant="outline" onClick={() => primaryAction.action()}>
              <ExternalLink className="w-3 h-3 mr-1" />
              {primaryAction.label}
            </Button>
          )}
        </div>
      ),
    })

    return () => {
      if (onDismiss) {
        onDismiss()
      }
    }
  }, [error, onRetry, onDismiss, toast, recoveryManager])

  return null
}

function getErrorTitle(error: PharmacyError): string {
  switch (error.type) {
    case "VALIDATION":
      return "Validation Error"
    case "NETWORK":
      return "Connection Error"
    case "DATABASE":
      return "Data Error"
    case "AUTHENTICATION":
      return "Authentication Required"
    case "AUTHORIZATION":
      return "Access Denied"
    case "BUSINESS_LOGIC":
      return "Operation Failed"
    case "SYSTEM":
      return "System Error"
    default:
      return "Error"
  }
}

function getToastVariant(error: PharmacyError): "default" | "destructive" {
  return error.severity === "HIGH" || error.severity === "CRITICAL" ? "destructive" : "default"
}

// Hook for easy error toast handling
export function useErrorToast() {
  const { toast } = useToast()
  const recoveryManager = ErrorRecoveryManager.getInstance()

  const showErrorToast = (error: PharmacyError | Error, onRetry?: () => void) => {
    let pharmacyError: PharmacyError

    if (error instanceof PharmacyError) {
      pharmacyError = error
    } else {
      pharmacyError = new PharmacyError(
        error.message,
        "SYSTEM" as any,
        "MEDIUM" as any,
        "UNKNOWN_ERROR",
        "An unexpected error occurred. Please try again.",
        true,
        true,
      )
    }

    const recoveryActions = recoveryManager.getRecoveryActions(pharmacyError)
    const primaryAction = recoveryActions.find((action) => action.primary)

    toast({
      title: getErrorTitle(pharmacyError),
      description: pharmacyError.userMessage,
      variant: getToastVariant(pharmacyError),
      duration: pharmacyError.severity === "CRITICAL" ? Number.POSITIVE_INFINITY : 5000,
      action: (
        <div className="flex gap-2">
          {onRetry && pharmacyError.retryable && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          )}
          {primaryAction && primaryAction.label !== "Try Again" && (
            <Button size="sm" variant="outline" onClick={() => primaryAction.action()}>
              <ExternalLink className="w-3 h-3 mr-1" />
              {primaryAction.label}
            </Button>
          )}
        </div>
      ),
    })
  }

  return { showErrorToast }
}
