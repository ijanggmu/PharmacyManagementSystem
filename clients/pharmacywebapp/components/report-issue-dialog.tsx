"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { createIssueTicket, issueReportErrorMessage, type IssueSeverity } from "@/lib/api/tickets-api"

/**
 * Fields to pre-fill when the dialog is opened from an error boundary instead of the manual
 * trigger. The error message/stack are attached to the ticket automatically — the user never
 * retypes context they already triggered.
 */
export interface ReportIssuePrefill {
  summary?: string
  description?: string
  errorMessage?: string
  errorStack?: string
}

export interface ReportIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: ReportIssuePrefill
}

const SEVERITIES: { value: IssueSeverity; label: string }[] = [
  { value: "Low", label: "Low — minor annoyance" },
  { value: "Medium", label: "Medium — gets in the way" },
  { value: "High", label: "High — blocks my work" },
  { value: "Critical", label: "Critical — data at risk or nothing works" },
]

type SubmitStatus = "idle" | "submitting" | "success" | "error"

/**
 * Looks up the signed-in user's id/email from the httpOnly session (no bearer token touches the
 * browser). Deliberately fetch-based rather than a React Query hook, so this dialog works both
 * inside the normal provider tree and inside app/global-error.tsx, which renders its own bare
 * <html>/<body> outside every app provider.
 */
async function loadReporter(): Promise<{ id?: string | null; email?: string | null }> {
  try {
    const res = await fetch("/api/dotnet/auth/session", { credentials: "same-origin", cache: "no-store" })
    if (!res.ok) return {}
    const json = (await res.json().catch(() => null)) as { user?: { id?: string; email?: string } } | null
    return { id: json?.user?.id ?? null, email: json?.user?.email ?? null }
  } catch {
    return {}
  }
}

/**
 * "Report an issue" form. Submits a real support ticket through the Tickets module (see
 * lib/api/tickets-api.ts) — the current page URL, browser user agent and signed-in user are
 * attached automatically, and (when opened from an error boundary) the error message and a
 * trimmed stack are pre-filled too.
 */
export function ReportIssueDialog({ open, onOpenChange, prefill }: ReportIssueDialogProps) {
  const [summary, setSummary] = useState("")
  const [description, setDescription] = useState("")
  const [severity, setSeverity] = useState<IssueSeverity>("Medium")
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSummary(prefill?.summary ?? (prefill?.errorMessage ? `Error: ${prefill.errorMessage}` : ""))
    setDescription(prefill?.description ?? "")
    setSeverity(prefill?.errorMessage ? "High" : "Medium")
    setStatus("idle")
    setErrorText(null)
    setTicketNumber(null)
    // Only re-run when the dialog opens or the prefill identity changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.summary, prefill?.description, prefill?.errorMessage, prefill?.errorStack])

  async function handleSubmit() {
    if (!summary.trim()) {
      setErrorText("Tell us briefly what happened.")
      return
    }
    setStatus("submitting")
    setErrorText(null)
    try {
      const reporter = await loadReporter()
      const ticket = await createIssueTicket({
        summary,
        description,
        severity,
        context: {
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          userId: reporter.id,
          userEmail: reporter.email,
          errorMessage: prefill?.errorMessage ?? null,
          errorStack: prefill?.errorStack ?? null,
        },
      })
      setTicketNumber(ticket.number)
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorText(issueReportErrorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby="report-issue-description">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription id="report-issue-description">
            This creates a support ticket our team can follow up on. The page and browser details are
            attached automatically.
          </DialogDescription>
        </DialogHeader>

        {status === "success" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Thanks — ticket <span className="font-mono font-medium">{ticketNumber}</span> was created. We
                will follow up if we need more details.
              </span>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-issue-summary">What happened?</Label>
              <Textarea
                id="report-issue-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="E.g. The save button on the new sale page did nothing"
                rows={2}
                maxLength={160}
                disabled={status === "submitting"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-issue-description">More details (optional)</Label>
              <Textarea
                id="report-issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Steps to reproduce, what you expected, anything else useful"
                rows={4}
                maxLength={2000}
                disabled={status === "submitting"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-issue-severity">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as IssueSeverity)}
                disabled={status === "submitting"}
              >
                <SelectTrigger id="report-issue-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {prefill?.errorMessage && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Captured automatically</p>
                <p className="font-mono mt-1 break-all">{prefill.errorMessage}</p>
              </div>
            )}

            {errorText && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{errorText}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === "submitting"}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={status === "submitting"}>
                {status === "submitting" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit report
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
