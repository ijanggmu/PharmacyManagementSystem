"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SkeletonTable } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { cn } from "@/lib/utils"
import { accountingApi, type AccountingAccount, type AccountingVoucherRow } from "@/features/accounting/api-client"
import { ACCOUNTING_ROOT_KEY, useVoucherDetail } from "@/features/accounting/hooks/use-vouchers"
import { emptyLine, newLineKey, validateJournal, type JournalLineDraft } from "@/features/accounting/lib/journal-form"
import { BalanceStatus, InlineAlert } from "./accounting-ui"
import { JournalLinesEditor } from "./journal-lines-editor"

interface EditDraftDialogProps {
  voucher: AccountingVoucherRow | null
  accounts: AccountingAccount[]
  onClose: () => void
}

export function EditDraftDialog({ voucher, accounts, onClose }: EditDraftDialogProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data, isLoading, error, refetch, isFetching } = useVoucherDetail(voucher?.id ?? null)
  const [date, setDate] = useState("")
  const [narration, setNarration] = useState("")
  const [lines, setLines] = useState<JournalLineDraft[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!voucher) {
      setLoadedFor(null)
      setShowErrors(false)
      return
    }
    if (!data || loadedFor === voucher.id) return
    setDate(data.voucher.voucher_date)
    setNarration(data.voucher.narration ?? "")
    const mapped = data.lines
      .slice()
      .sort((a, b) => a.line_no - b.line_no)
      .map<JournalLineDraft>((l) => ({
        key: newLineKey(),
        account_id: l.account_id,
        description: l.description ?? "",
        debit: Number(l.debit_amount) ? Number(l.debit_amount).toFixed(2) : "",
        credit: Number(l.credit_amount) ? Number(l.credit_amount).toFixed(2) : "",
      }))
    while (mapped.length < 2) mapped.push(emptyLine())
    setLines(mapped)
    setLoadedFor(voucher.id)
  }, [voucher, data, loadedFor])

  const validation = useMemo(() => validateJournal(lines), [lines])

  const save = async () => {
    if (!voucher) return
    setShowErrors(true)
    if (!date) {
      toast({ title: "Choose the voucher date", variant: "destructive" })
      return
    }
    if (!validation.ok) return
    setSaving(true)
    try {
      await accountingApi.editVoucher(voucher.id, { voucher_date: date, narration: narration.trim() || null, lines: validation.payload })
      await qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })
      toast({ title: "Draft updated", description: voucher.voucher_no })
      onClose()
    } catch (e) {
      toast({ title: "Update failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const ready = !!voucher && loadedFor === voucher.id

  return (
    <Dialog open={!!voucher} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "w-[calc(100vw-2rem)] max-w-4xl sm:max-w-4xl")}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Edit draft {voucher?.voucher_no}</DialogTitle>
          <DialogDescription>Only drafts can be edited. Debits must equal credits before you save.</DialogDescription>
        </DialogHeader>
        {error ? (
          <DialogScrollBody className="pb-6">
            <ErrorState size="compact" message={apiRequestErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
          </DialogScrollBody>
        ) : isLoading || !ready ? (
          <DialogScrollBody className="pb-6">
            <SkeletonTable rows={4} cols={4} />
          </DialogScrollBody>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <DialogScrollBody className="space-y-5 py-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="edit-voucher-date">
                    Voucher date <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <DatePicker id="edit-voucher-date" value={date} onChange={setDate} disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-voucher-narration">Narration</Label>
                  <Input
                    id="edit-voucher-narration"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <JournalLinesEditor
                accounts={accounts}
                lines={lines}
                onChange={setLines}
                errors={validation.lineErrors}
                showErrors={showErrors}
                disabled={saving}
                idPrefix="edit"
              />
              {showErrors && validation.formError && <InlineAlert tone="destructive">{validation.formError}</InlineAlert>}
            </DialogScrollBody>
            <DialogStickyFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <BalanceStatus balanced={validation.totals.difference === 0 && validation.totals.debit > 0} difference={validation.totals.difference} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving} loadingText="Saving…">
                  Save changes
                </Button>
              </div>
            </DialogStickyFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
