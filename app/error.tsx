"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react"
import Link from "next/link"
import { SUPPORT_EMAIL } from "@/lib/constants/support"
import { ReportIssueDialog } from "@/components/report-issue-dialog"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    console.error("Application Error:", error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-red-100 rounded-full w-fit">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-semibold text-foreground">Something went wrong!</CardTitle>
          <CardDescription>We encountered an unexpected error in the pharmacy management system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-800 mb-2">Error Details</h3>
            <p className="text-sm text-red-700 bg-red-100 p-2 rounded font-mono">
              {error.message || "An unexpected error occurred"}
            </p>
            {error.digest && (
              <p className="text-xs text-red-600 mt-2">
                Error ID: <span className="font-mono">{error.digest}</span>
              </p>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">What you can try:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Refresh the page to try again</li>
              <li>• Check your internet connection</li>
              <li>• Clear your browser cache and cookies</li>
              <li>• Contact system administrator if the problem persists</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={reset} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" asChild className="flex-1 bg-transparent">
              <Link href="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Link>
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() => setReportOpen(true)}
            className="w-full bg-transparent"
          >
            <Bug className="h-4 w-4 mr-2" />
            Report this issue
          </Button>

          <div className="text-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {SUPPORT_EMAIL ? (
                <>
                  Still stuck? Email{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                  {error.digest ? <> and quote reference <span className="font-mono">{error.digest}</span></> : null}.
                </>
              ) : (
                <>If this keeps happening, contact your pharmacy administrator.</>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
      <ReportIssueDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        prefill={{
          errorMessage: error.message || error.name || "Unknown error",
          errorStack: error.stack,
        }}
      />
    </div>
  )
}
