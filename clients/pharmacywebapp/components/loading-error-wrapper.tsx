"use client"

import type React from "react"

import { Suspense } from "react"
import ErrorBoundary from "./error-boundary"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface LoadingErrorWrapperProps {
  children: React.ReactNode
  loadingMessage?: string
  errorFallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

function LoadingFallback({ message = "Loading..." }: { message?: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{message}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function LoadingErrorWrapper({ children, loadingMessage, errorFallback }: LoadingErrorWrapperProps) {
  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={<LoadingFallback message={loadingMessage} />}>{children}</Suspense>
    </ErrorBoundary>
  )
}
