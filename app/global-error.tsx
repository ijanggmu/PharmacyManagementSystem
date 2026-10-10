"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, RefreshCw, Home, Shield, Bug } from "lucide-react"
import { SUPPORT_EMAIL, SUPPORT_PHONE, telHref } from "@/lib/constants/support"
import { ReportIssueDialog } from "@/components/report-issue-dialog"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global Application Error:", error)
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-0 shadow-2xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto mb-4 p-4 bg-red-100 rounded-full w-fit">
                <Shield className="h-12 w-12 text-red-600" />
              </div>
              <CardTitle className="text-3xl font-bold text-gray-900 mb-2">System Error</CardTitle>
              <CardDescription className="text-lg text-gray-600">
                A critical error occurred in the pharmacy management system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Error Details */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Critical System Error
                </h3>
                <p className="text-sm text-red-700 font-mono bg-red-100 p-2 rounded">
                  {error.message || "A critical system error occurred"}
                </p>
                {error.digest && (
                  <p className="text-xs text-red-600 mt-2">
                    Error ID: <span className="font-mono">{error.digest}</span>
                  </p>
                )}
              </div>

              {/* Emergency Instructions */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="font-semibold text-orange-800 mb-3">Emergency Procedures:</h3>
                <ul className="space-y-2 text-sm text-orange-700">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-full mt-2 flex-shrink-0"></span>
                    Contact your system administrator immediately
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-full mt-2 flex-shrink-0"></span>
                    Use backup systems if available
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-full mt-2 flex-shrink-0"></span>
                    Document any recent actions that may have caused this error
                  </li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  onClick={reset}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart Application
                </Button>
                <Button onClick={() => window.location.reload()} variant="outline" className="flex-1 bg-transparent">
                  <Home className="h-4 w-4 mr-2" />
                  Reload Page
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

              {/* Emergency Contact */}
              <div className="text-center pt-4 border-t bg-red-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-lg">
                <p className="text-sm text-red-700 font-medium">Critical error — please contact your IT support</p>
                <p className="text-sm text-red-600 mt-1">
                  {SUPPORT_PHONE || SUPPORT_EMAIL ? (
                    <>
                      {SUPPORT_PHONE && (
                        <>
                          Phone:{" "}
                          <a href={telHref(SUPPORT_PHONE)} className="font-mono hover:underline">
                            {SUPPORT_PHONE}
                          </a>
                        </>
                      )}
                      {SUPPORT_PHONE && SUPPORT_EMAIL && <br />}
                      {SUPPORT_EMAIL && (
                        <>
                          Email:{" "}
                          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-mono hover:underline">
                            {SUPPORT_EMAIL}
                          </a>
                        </>
                      )}
                    </>
                  ) : (
                    <>Your pharmacy administrator can help you get back in.</>
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
      </body>
    </html>
  )
}
