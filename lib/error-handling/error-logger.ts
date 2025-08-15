import { PharmacyError, ErrorSeverity } from "./error-types"

export interface ErrorLog {
  id: string
  error: PharmacyError
  stackTrace: string
  resolved: boolean
  reportedAt: string
}

export class ErrorLogger {
  private static instance: ErrorLogger
  private errorLogs: ErrorLog[] = []

  private constructor() {}

  public static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger()
    }
    return ErrorLogger.instance
  }

  public async logError(error: PharmacyError | Error, additionalContext?: Record<string, any>): Promise<void> {
    try {
      let pharmacyError: PharmacyError

      if (error instanceof PharmacyError) {
        pharmacyError = error
      } else {
        // Convert regular Error to PharmacyError
        pharmacyError = new PharmacyError(
          error.message,
          this.inferErrorType(error),
          ErrorSeverity.MEDIUM,
          "UNKNOWN_ERROR",
          "An unexpected error occurred. Please try again.",
          true,
          true,
          additionalContext,
        )
      }

      const errorLog: ErrorLog = {
        id: this.generateErrorId(),
        error: pharmacyError,
        stackTrace: error.stack || "",
        resolved: false,
        reportedAt: new Date().toISOString(),
      }

      // Store locally
      this.errorLogs.push(errorLog)

      // Log to console in development
      if (process.env.NODE_ENV === "development") {
        console.group(`🚨 ${pharmacyError.severity} Error: ${pharmacyError.code}`)
        console.error("Message:", pharmacyError.message)
        console.error("User Message:", pharmacyError.userMessage)
        console.error("Type:", pharmacyError.type)
        console.error("Context:", pharmacyError.context)
        console.error("Stack:", error.stack)
        console.groupEnd()
      }

      // Send to external logging service in production
      if (process.env.NODE_ENV === "production") {
        await this.sendToExternalLogger(errorLog)
      }

      // Send critical errors immediately
      if (pharmacyError.severity === ErrorSeverity.CRITICAL) {
        await this.sendCriticalAlert(errorLog)
      }
    } catch (loggingError) {
      console.error("Failed to log error:", loggingError)
    }
  }

  private inferErrorType(error: Error): import("./error-types").ErrorType {
    const message = error.message.toLowerCase()

    if (message.includes("network") || message.includes("fetch")) {
      return import("./error-types").ErrorType.NETWORK
    }
    if (message.includes("validation") || message.includes("invalid")) {
      return import("./error-types").ErrorType.VALIDATION
    }
    if (message.includes("database") || message.includes("sql")) {
      return import("./error-types").ErrorType.DATABASE
    }
    if (message.includes("auth")) {
      return import("./error-types").ErrorType.AUTHENTICATION
    }

    return import("./error-types").ErrorType.SYSTEM
  }

  private generateErrorId(): string {
    return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async sendToExternalLogger(errorLog: ErrorLog): Promise<void> {
    try {
      // In a real application, you would send this to a service like Sentry, LogRocket, etc.
      // For now, we'll simulate the API call
      await fetch("/api/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(errorLog),
      })
    } catch (error) {
      console.error("Failed to send error to external logger:", error)
    }
  }

  private async sendCriticalAlert(errorLog: ErrorLog): Promise<void> {
    try {
      // Send immediate notification for critical errors
      // This could be email, Slack, SMS, etc.
      console.error("🚨 CRITICAL ERROR ALERT:", errorLog)

      // In a real app, you might call an alerting service
      await fetch("/api/alerts/critical", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          errorId: errorLog.id,
          message: errorLog.error.message,
          severity: errorLog.error.severity,
          timestamp: errorLog.reportedAt,
        }),
      })
    } catch (error) {
      console.error("Failed to send critical alert:", error)
    }
  }

  public getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs]
  }

  public getUnresolvedErrors(): ErrorLog[] {
    return this.errorLogs.filter((log) => !log.resolved)
  }

  public markErrorAsResolved(errorId: string): void {
    const errorLog = this.errorLogs.find((log) => log.id === errorId)
    if (errorLog) {
      errorLog.resolved = true
    }
  }

  public clearErrorLogs(): void {
    this.errorLogs = []
  }
}
