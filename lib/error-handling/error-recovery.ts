import { PharmacyError } from "./error-types"
import { ErrorLogger } from "./error-logger"

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

export interface RecoveryAction {
  label: string
  action: () => Promise<void> | void
  primary?: boolean
}

export class ErrorRecoveryManager {
  private static instance: ErrorRecoveryManager
  private errorLogger = ErrorLogger.getInstance()

  private constructor() {}

  public static getInstance(): ErrorRecoveryManager {
    if (!ErrorRecoveryManager.instance) {
      ErrorRecoveryManager.instance = new ErrorRecoveryManager()
    }
    return ErrorRecoveryManager.instance
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: Record<string, any>,
  ): Promise<T> {
    const defaultConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    }

    const finalConfig = { ...defaultConfig, ...config }
    let lastError: Error

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        // Log the error
        await this.errorLogger.logError(lastError, {
          ...context,
          attempt,
          maxAttempts: finalConfig.maxAttempts,
        })

        // Don't retry if it's the last attempt
        if (attempt === finalConfig.maxAttempts) {
          break
        }

        // Don't retry if error is not retryable
        if (error instanceof PharmacyError && !error.retryable) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
          finalConfig.maxDelay,
        )

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000

        await this.sleep(jitteredDelay)
      }
    }

    throw lastError!
  }

  public getRecoveryActions(error: PharmacyError): RecoveryAction[] {
    const actions: RecoveryAction[] = []

    // Common recovery actions
    actions.push({
      label: "Try Again",
      action: () => window.location.reload(),
      primary: true,
    })

    // Specific recovery actions based on error type
    switch (error.type) {
      case "NETWORK":
        actions.push({
          label: "Check Connection",
          action: () => {
            if (navigator.onLine) {
              alert("Your internet connection appears to be working. The server might be temporarily unavailable.")
            } else {
              alert("Please check your internet connection and try again.")
            }
          },
        })
        break

      case "AUTHENTICATION":
        actions.push({
          label: "Sign In Again",
          action: () => {
            // Redirect to login page
            window.location.href = "/auth/login"
          },
        })
        break

      case "VALIDATION":
        actions.push({
          label: "Review Input",
          action: () => {
            // Focus on the first invalid field if possible
            const firstInvalidField = document.querySelector('[aria-invalid="true"]') as HTMLElement
            if (firstInvalidField) {
              firstInvalidField.focus()
            }
          },
        })
        break

      case "BUSINESS_LOGIC":
        if (error.code === "INSUFFICIENT_STOCK") {
          actions.push({
            label: "Check Inventory",
            action: () => {
              window.location.href = "/dashboard/inventory"
            },
          })
        }
        break
    }

    // Add contact support action for high severity errors
    if (error.severity === "HIGH" || error.severity === "CRITICAL") {
      actions.push({
        label: "Contact Support",
        action: () => {
          const subject = encodeURIComponent(`Error Report: ${error.code}`)
          const body = encodeURIComponent(`
Error Code: ${error.code}
Error Message: ${error.message}
Time: ${error.context.timestamp}
URL: ${error.context.url}

Please describe what you were doing when this error occurred:
          `)
          window.open(`mailto:support@pharmacy.com?subject=${subject}&body=${body}`)
        },
      })
    }

    return actions
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  public async handleError(error: Error, context?: Record<string, any>): Promise<void> {
    // Log the error
    await this.errorLogger.logError(error, context)

    // If it's a PharmacyError, we can provide specific recovery options
    if (error instanceof PharmacyError) {
      // The UI components will handle displaying recovery actions
      return
    }

    // For unknown errors, convert to PharmacyError
    const pharmacyError = new PharmacyError(
      error.message,
      "SYSTEM" as any,
      "HIGH" as any,
      "UNKNOWN_ERROR",
      "An unexpected error occurred. Please try again or contact support if the problem persists.",
      true,
      true,
      context,
    )

    await this.errorLogger.logError(pharmacyError, context)
  }
}
