"use client"

import { useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { InlineAlert } from "@/features/accounting/components/accounting-ui"
import type { OpeningBalanceState } from "@/features/accounting/api-client-opening-balances"
import { useOpeningBalanceMutations } from "@/features/accounting/hooks/use-opening-balances"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useToast } from "@/hooks/use-toast"

/** Reset = reverse the active opening voucher and leave none, with a mandatory reason. */
export function OpeningBalanceResetDialog({
  open,
  onOpenChange,
  branchId,
  branchName,
  state,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: string
  branchName: string
  state: OpeningBalanceState
}) {
  const { toast } = useToast()
  const { reset } = useOpeningBalanceMutations()
  const [reason, setReason] = useState("")
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      setReason("")
      setTouched(false)
      setError(null)
      requestIdRef.current = null
    }
  }, [open])

  const confirm = () => {
    setTouched(true)
    if (!reason.trim()) return
    requestIdRef.current ??= crypto.randomUUID()
    reset.mutate(
      { requestId: requestIdRef.current, branchId, expectedVersion: state.version, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ title: "Opening balances reset", description: "The opening voucher was reversed. You can set them up again." })
          onOpenChange(false)
        },
        onError: (e) => setError(apiRequestErrorMessage(e) || "Could not reset opening balances."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !reset.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset opening balances?</DialogTitle>
          <DialogDescription>
            The opening voucher {state.voucherNo ? <span className="num font-medium text-foreground">{state.voucherNo}</span> : null} for{" "}
            {branchName} is reversed on its own date ({state.openingDate}). Nothing is deleted: both vouchers stay in the register and
            this reset is recorded in the history. You can then set the balances up again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reset-reason">
            Reason <span className="text-destructive" aria-hidden>*</span>
          </Label>
          <Textarea
            id="reset-reason"
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
              requestIdRef.current = null
            }}
            placeholder="e.g. Entered against the wrong branch"
            aria-required
            aria-invalid={touched && !reason.trim()}
          />
          {touched && !reason.trim() && (
            <p className="text-xs font-medium text-destructive" role="alert">
              A reason is required.
            </p>
          )}
        </div>

        {error && <InlineAlert tone="destructive">{error}</InlineAlert>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={reset.isPending}>
            Keep them
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} loading={reset.isPending} loadingText="Resetting…">
            <RotateCcw aria-hidden />
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
