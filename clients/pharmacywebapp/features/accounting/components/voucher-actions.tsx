"use client"

/**
 * Voucher lifecycle actions (post, reverse, void, delete draft) with their confirmation dialogs.
 * Used by the voucher register rows and by the voucher detail sheet so the rules live in one place:
 *  - Draft  → Post, Edit, Delete
 *  - Posted → Reverse (any voucher; creates a reversing journal and voids the original)
 *  - Posted → Void (manual journals only; system vouchers must be reversed so their source stays traceable)
 */

import { useState, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/ui/field-error"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { formatLocalDateYmd } from "@/lib/utils/date"
import type { AccountingVoucherRow } from "@/features/accounting/api-client"
import { useVoucherMutations } from "@/features/accounting/hooks/use-vouchers"
import { isManualJournal } from "@/features/accounting/lib/voucher-meta"

export type VoucherAction = "post" | "reverse" | "void" | "delete"

export interface VoucherCapabilities {
  canPost: boolean
  canEdit: boolean
  canDelete: boolean
  canReverse: boolean
  canVoid: boolean
}

export function voucherCapabilities(v: Pick<AccountingVoucherRow, "status" | "source" | "voucher_type">): VoucherCapabilities {
  const s = (v.status ?? "").toLowerCase()
  const manual = isManualJournal(v)
  return {
    canPost: s === "draft",
    canEdit: s === "draft" && manual,
    canDelete: s === "draft" && manual,
    canReverse: s === "posted",
    canVoid: s === "posted" && manual,
  }
}

type Target = Pick<AccountingVoucherRow, "id" | "voucher_no">

export function useVoucherActions(options?: { onDone?: (action: VoucherAction, voucher: Target) => void }) {
  const { toast } = useToast()
  const { reverse, voidVoucher, post, remove } = useVoucherMutations()
  const [pending, setPending] = useState<{ action: VoucherAction; voucher: Target } | null>(null)
  const [reversalDate, setReversalDate] = useState(() => formatLocalDateYmd(new Date()))
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | undefined>()

  const close = () => {
    setPending(null)
    setReason("")
    setReasonError(undefined)
  }

  const request = (action: VoucherAction, voucher: Target) => {
    setReversalDate(formatLocalDateYmd(new Date()))
    setReason("")
    setReasonError(undefined)
    setPending({ action, voucher })
  }

  const finish = (action: VoucherAction, voucher: Target, title: string, description?: string) => {
    toast({ title, description })
    close()
    options?.onDone?.(action, voucher)
  }

  const fail = (title: string, e: unknown) => {
    toast({ title, description: apiRequestErrorMessage(e), variant: "destructive" })
  }

  const confirm = async () => {
    if (!pending) return
    const { action, voucher } = pending
    try {
      if (action === "post") {
        await post.mutateAsync(voucher.id)
        finish(action, voucher, "Voucher posted", voucher.voucher_no)
      } else if (action === "delete") {
        await remove.mutateAsync(voucher.id)
        finish(action, voucher, "Draft deleted", voucher.voucher_no)
      } else if (action === "reverse") {
        await reverse.mutateAsync({ id: voucher.id, reversalDate: reversalDate || undefined })
        finish(action, voucher, "Voucher reversed", `${voucher.voucher_no} is now void; a reversing journal was posted.`)
      } else if (action === "void") {
        const r = reason.trim()
        if (r.length < 3) {
          setReasonError("Give a short reason (at least 3 characters) — it is kept on the voucher.")
          return
        }
        await voidVoucher.mutateAsync({ id: voucher.id, reason: r })
        finish(action, voucher, "Voucher voided", voucher.voucher_no)
      }
    } catch (e) {
      const label = { post: "Post", delete: "Delete", reverse: "Reverse", void: "Void" }[action]
      fail(`${label} failed`, e)
    }
  }

  const busy = reverse.isPending || voidVoucher.isPending || post.isPending || remove.isPending
  const no = pending?.voucher.voucher_no ?? ""

  const element: ReactNode = (
    <>
      <ConfirmDialog
        isOpen={pending?.action === "post"}
        onClose={close}
        onConfirm={() => void confirm()}
        title={`Post voucher ${no}?`}
        description="Posting writes this voucher to the ledger. After posting it can no longer be edited — only reversed."
        confirmText="Post voucher"
        variant="default"
        loading={busy}
      />
      <ConfirmDialog
        isOpen={pending?.action === "delete"}
        onClose={close}
        onConfirm={() => void confirm()}
        title={`Delete draft ${no}?`}
        description="This permanently removes the draft and its lines. Only unposted drafts can be deleted."
        confirmText="Delete draft"
        variant="destructive"
        loading={busy}
      />

      <Dialog open={pending?.action === "reverse"} onOpenChange={(o) => !o && !busy && close()}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-warning" aria-hidden />
              Reverse voucher {no}?
            </DialogTitle>
            <DialogDescription>
              Posts a reversing journal (debits and credits swapped) and marks the original as void. Both stay in
              the register, linked to each other. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reversal-date">Reversal date</Label>
            <DatePicker id="reversal-date" value={reversalDate} onChange={setReversalDate} disabled={busy} aria-describedby="reversal-date-help" />
            <p id="reversal-date-help" className="text-xs text-muted-foreground">Must be after the posting lock date.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirm()} loading={busy} disabled={!reversalDate}>
              Reverse voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pending?.action === "void"} onOpenChange={(o) => !o && !busy && close()}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              Void voucher {no}?
            </DialogTitle>
            <DialogDescription>
              Voiding removes this manual journal from the ledger without posting a reversal. Prefer
              <span className="font-medium text-foreground"> Reverse </span>
              if the period has been reported. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              void confirm()
            }}
          >
            <Label htmlFor="void-reason">
              Reason <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(undefined)
              }}
              rows={3}
              placeholder="e.g. Duplicate entry of JV-000123"
              aria-invalid={!!reasonError}
              aria-describedby={reasonError ? "void-reason-error" : undefined}
              disabled={busy}
            />
            <div id="void-reason-error">
              <FieldError message={reasonError} />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={busy}>
                Void voucher
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )

  return { request, element, busy }
}
