"use client"

import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCurrency } from "@/lib/contexts/currency-context"
import { approvalsApi, type IssuedApproval } from "@/features/approvals/api-client"
import {
  approvalActionLabel,
  buildIssueApprovalBody,
  formatApprovalAmount,
  type ApprovalRequest,
  type IssueApprovalBody,
} from "@/features/approvals/lib/approval"

interface ApprovalDialogProps {
  /** The approval the server asked for; null closes the dialog. */
  request: ApprovalRequest | null
  onCancel: () => void
  /** Called with the single-use token; resubmit the action with it. */
  onApproved: (token: string, approval: IssuedApproval) => void
}

/**
 * Manager approval at the counter: a manager (any user allowed to approve) types their own email and password on
 * this screen. The server re-checks the password (wrong ones count toward their lockout), that they may approve and
 * that they aren't the person asking, and returns a token valid for a few minutes, for this action only.
 */
export function ApprovalDialog({ request, onCancel, onApproved }: ApprovalDialogProps) {
  const { formatCurrency } = useCurrency()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [reason, setReason] = useState("")

  // Each request starts blank: never carry an approver's password over to the next approval.
  useEffect(() => {
    setLogin("")
    setPassword("")
    setReason("")
  }, [request])

  const issue = useMutation({
    // Per-call data goes through mutate(body) so a resubmission can never pick up a stale request.
    mutationFn: (body: IssueApprovalBody) => approvalsApi.issue(body),
    retry: false,
  })

  const open = request !== null
  const canSubmit = open && login.trim().length > 0 && password.length > 0 && !issue.isPending

  const submit = () => {
    if (!request || !canSubmit) return
    issue.mutate(buildIssueApprovalBody(request, login, password, reason), {
      onSuccess: (approval) => {
        setPassword("")
        onApproved(approval.token, approval)
      },
      onError: () => setPassword(""),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          issue.reset()
          onCancel()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            Manager approval needed
          </DialogTitle>
          <DialogDescription>{request?.message}</DialogDescription>
        </DialogHeader>

        {request && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{approvalActionLabel(request.action)}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="num font-semibold">{formatApprovalAmount(request.action, request.amount, formatCurrency)}</span>
          </div>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="approval-login">Approver email or username</Label>
            <Input
              id="approval-login"
              autoComplete="off"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={issue.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="approval-password">Approver password</Label>
            <Input
              id="approval-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={issue.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="approval-reason">Reason (optional)</Label>
            <Textarea
              id="approval-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={issue.isPending}
            />
          </div>
          {issue.error && (
            <p role="alert" className="text-sm text-destructive">
              {issue.error instanceof Error ? issue.error.message : "Approval failed."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            The approval is recorded with the approver&apos;s name and is valid for this action only, for a few minutes.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                issue.reset()
                onCancel()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {issue.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
              Approve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
