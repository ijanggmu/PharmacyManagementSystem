"use client"

import type React from "react"
import { Component, type ReactNode } from "react"
import { PharmacyError, ErrorType, ErrorSeverity } from "@/lib/error-handling/error-types"
import { ErrorLogger } from "@/lib/error-handling/error-logger"
import { ErrorRecoveryManager } from "@/lib/error-handling/error-recovery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// Alert component not available, using div instead
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, RefreshCw, Home, Mail, Bug } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  level?: "page" | "component" | "critical"
}

interface State {
  hasError: boolean
  error: PharmacyError | null
  errorId: string | null
  retryCount: number
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  private errorLogger = ErrorLogger.getInstance()
  private recoveryManager = ErrorRecoveryManager.getInstance()

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error: error instanceof PharmacyError ? error : null,
    }
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError, level = "component" } = this.props

    // Convert to PharmacyError if needed
    let pharmacyError: PharmacyError
    if (error instanceof PharmacyError) {
      pharmacyError = error
    } else {
      const severity = level === "critical" ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH
      pharmacyError = new PharmacyError(
        error.message,
        ErrorType.SYSTEM,
        severity,
        "COMPONENT_ERROR",
        "Something went wrong with this part of the application.",
        true,
        true,
        {
          componentStack: errorInfo.componentStack,
          level,
          retryCount: this.state.retryCount,
        },
      )
    }

    // Log the error
    await this.errorLogger.logError(pharmacyError, {
      componentStack: errorInfo.componentStack,
      level,
    })

    this.setState({
      error: pharmacyError,
      errorId: `ERR_${Date.now()}`,
    })

    // Call custom error handler
    if (onError) {
      onError(error, errorInfo)
    }
  }

  handleRetry = () => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: prevState.retryCount + 1,
    }))
  }

  handleGoHome = () => {
    window.location.href = "/dashboard"
  }

  handleReportBug = () => {
    const { error, errorId } = this.state
    if (!error || !errorId) return

    const subject = encodeURIComponent(`Bug Report: ${error.code}`)
    const body = encodeURIComponent(`
Error ID: ${errorId}
Error Code: ${error.code}
Error Message: ${error.message}
Time: ${error.context.timestamp}
URL: ${error.context.url}
Retry Count: ${this.state.retryCount}

Component Stack:
${error.context.additionalData?.componentStack || "Not available"}

Please describe what you were doing when this error occurred:
    `)

    window.open(`mailto:support@pharmacy.com?subject=${subject}&body=${body}`)
  }

  render() {
    const { hasError, error } = this.state
    const { children, fallback, level = "component" } = this.props

    if (!hasError) {
      return children
    }

    // Use custom fallback if provided
    if (fallback) {
      return fallback
    }

    // Critical level errors get a full-page treatment
    if (level === "critical") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <CardTitle className="text-xl text-red-900">Critical System Error</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">
                    {error?.userMessage || "A critical error has occurred. Please contact support immediately."}
                  </span>
                </div>
              </div>

              {error && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{error.severity}</Badge>
                    <Badge variant="outline">{error.code}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">Error ID: {this.state.errorId}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button onClick={this.handleRetry} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button variant="outline" onClick={this.handleGoHome} className="w-full bg-transparent">
                  <Home className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </Button>
                <Button variant="outline" onClick={this.handleReportBug} className="w-full bg-transparent">
                  <Mail className="w-4 h-4 mr-2" />
                  Contact Support
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    // Component level errors get a smaller treatment
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-red-800">
            <AlertTriangle className="w-4 h-4" />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-700">
            {error?.userMessage || "This component encountered an error and couldn't load properly."}
          </p>

          {error && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {error.code}
              </Badge>
              {this.state.retryCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  Retry #{this.state.retryCount}
                </Badge>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={this.handleRetry} className="flex-1">
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={this.handleReportBug}>
              <Bug className="w-3 h-3 mr-1" />
              Report
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
}

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, "children">,
) {
  const WrappedComponent = (props: P) => (
    <EnhancedErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </EnhancedErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}
