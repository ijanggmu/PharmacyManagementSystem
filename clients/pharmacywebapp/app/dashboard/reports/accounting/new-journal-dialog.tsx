"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Eraser, Info, Save, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import { useToast } from "@/hooks/use-toast"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { dotnetPermissionAllowed } from "@/lib/api/dotnet-permissions"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { accountingApi } from "@/features/accounting/api-client"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { ACCOUNTING_ROOT_KEY } from "@/features/accounting/hooks/use-vouchers"
import { JournalLinesEditor } from "@/features/accounting/components/journal-lines-editor"
import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { emptyLine, validateJournal, type JournalLineDraft } from "@/features/accounting/lib/journal-form"
import { BalanceStatus, InlineAlert } from "./accounting-ui"
import { useAccountingContext } from "./accounting-context"

interface NewJournalDialogValue {
  /** Opens the manual journal dialog. No-op for users without accounting:write. */
  open: () => void
  /** Whether the current user may create journals; false until permissions load. */
  canWrite: boolean
}

const NewJournalDialogContext = createContext<NewJournalDialogValue | null>(null)

export function useNewJournalDialog(): NewJournalDialogValue {
  const value = useContext(NewJournalDialogContext)
  if (!value) throw new Error("useNewJournalDialog must be used inside NewJournalDialogProvider")
  return value
}

/** Owns the single "New journal" dialog for the accounting area; any page can open it via useNewJournalDialog. */
export function NewJournalDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [canWrite, setCanWrite] = useState(false)

  useEffect(() => {
    loadDotnetCurrentUser()
      .then((current) => setCanWrite(dotnetPermissionAllowed("accounting:write", current?.info.permissions ?? [])))
      .catch(() => setCanWrite(false))
  }, [])

  const open = useCallback(() => {
    if (canWrite) setIsOpen(true)
  }, [canWrite])
  const value = useMemo(() => ({ open, canWrite }), [open, canWrite])

  return (
    <NewJournalDialogContext.Provider value={value}>
      {children}
      {canWrite && <NewJournalDialog open={isOpen} onOpenChange={setIsOpen} />}
    </NewJournalDialogContext.Provider>
  )
}

function NewJournalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { amount } = useAccountingMoney()
  const { accounts, accountsLoading, lockDate } = useAccountingContext()

  const [journalDate, setJournalDate] = useState(() => formatLocalDateYmd(new Date()))
  const [narration, setNarration] = useState("")
  const [lines, setLines] = useState<JournalLineDraft[]>(() => [emptyLine(), emptyLine()])
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState<"draft" | "post" | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const validation = useMemo(() => validateJournal(lines), [lines])
  const dateLocked = !!lockDate && !!journalDate && journalDate <= lockDate
  const { debit, credit, difference } = validation.totals
  const empty = debit === 0 && credit === 0
  const balanced = !empty && difference === 0
  const dirty = !!narration.trim() || lines.some((l) => l.account_id || Number(l.debit) || Number(l.credit) || l.description.trim())

  const reset = () => {
    setJournalDate(formatLocalDateYmd(new Date()))
    setLines([emptyLine(), emptyLine()])
    setNarration("")
    setShowErrors(false)
  }

  const close = () => {
    onOpenChange(false)
    setConfirmDiscard(false)
    reset()
  }

  /** Closing with entered lines asks first, so a stray Escape or outside click doesn't lose work. */
  const requestClose = () => {
    if (saving) return
    if (dirty) setConfirmDiscard(true)
    else close()
  }

  const save = async (andPost: boolean) => {
    setShowErrors(true)
    if (!journalDate) {
      toast({ title: "Choose the voucher date", variant: "destructive" })
      return
    }
    if (!validation.ok || dateLocked) return
    setSaving(andPost ? "post" : "draft")
    try {
      const res = await accountingApi.createManualDraft({
        voucher_date: journalDate,
        narration: narration.trim() || null,
        lines: validation.payload,
      })
      if (andPost) {
        try {
          await accountingApi.postVoucher(res.id)
          toast({ title: "Journal posted", description: res.voucher_no || undefined })
        } catch (e) {
          toast({
            title: "Saved as draft, but posting failed",
            description: `${res.voucher_no || "The draft"} is in the voucher register. ${apiRequestErrorMessage(e)}`,
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "Draft saved",
          description: `${res.voucher_no || "The draft"} is in the voucher register — post it when ready.`,
        })
      }
      await qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })
      close()
    } catch (e) {
      toast({ title: "Save failed", description: apiRequestErrorMessage(e), variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>New journal entry</DialogTitle>
            <DialogDescription>
              Record an adjustment the system can&apos;t post automatically. Save is enabled once debits equal credits.
            </DialogDescription>
          </DialogHeader>

          <DialogScrollBody>
            <form
              id="new-journal-form"
              className="space-y-6 pb-4"
              onSubmit={(e) => {
                e.preventDefault()
                void save(false)
              }}
            >
              <fieldset className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                <legend className="sr-only">Voucher details</legend>
                <div className="space-y-2">
                  <Label htmlFor="journal-date">
                    Voucher date <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <DatePicker
                    id="journal-date"
                    value={journalDate}
                    onChange={setJournalDate}
                    disabled={!!saving}
                    aria-invalid={dateLocked}
                    aria-describedby="journal-date-help"
                  />
                  <p id="journal-date-help" className={cn("text-xs", dateLocked ? "text-destructive" : "text-muted-foreground")} role={dateLocked ? "alert" : undefined}>
                    {dateLocked
                      ? `Books are locked through ${lockDate}. Pick a later date.`
                      : journalDate
                        ? `BS ${formatBsLong(journalDate)}`
                        : "AD or BS — the entry posts on this date."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="journal-narration">Narration</Label>
                  <Input
                    id="journal-narration"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder="e.g. Month-end depreciation for Ashwin"
                    disabled={!!saving}
                    aria-describedby="journal-narration-help"
                  />
                  <p id="journal-narration-help" className="text-xs text-muted-foreground">
                    Why this entry is made — printed on the voucher.
                  </p>
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">
                  Lines <span className="font-normal text-muted-foreground">(at least two)</span>
                </legend>
                <JournalLinesEditor
                  accounts={accounts}
                  lines={lines}
                  onChange={setLines}
                  errors={validation.lineErrors}
                  showErrors={showErrors}
                  disabled={!!saving}
                  accountsLoading={accountsLoading}
                  idPrefix="nj"
                />
              </fieldset>

              {showErrors && validation.formError && <InlineAlert tone="destructive">{validation.formError}</InlineAlert>}

              <p className="flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
                Shown as MJE in the register. Drafts can be edited or deleted; once posted a journal can only be reversed
                or voided. Sales, purchases and payments post their own vouchers — don&apos;t re-enter them here.
              </p>
            </form>
          </DialogScrollBody>

          <DialogStickyFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <dl className="flex gap-6 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Debits</dt>
                  <dd className="num font-semibold">{amount(debit)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Credits</dt>
                  <dd className="num font-semibold">{amount(credit)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Difference</dt>
                  <dd className={cn("num font-semibold", !empty && !balanced && "text-destructive", balanced && "text-success")}>
                    {amount(Math.abs(difference))}
                  </dd>
                </div>
              </dl>
              {empty ? (
                <span className="text-xs text-muted-foreground">Enter amounts to balance the entry.</span>
              ) : (
                <BalanceStatus balanced={balanced} difference={difference} className="text-xs" />
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="ghost" onClick={reset} disabled={!!saving || !dirty}>
                <Eraser aria-hidden />
                Clear
              </Button>
              <Button type="button" variant="outline" onClick={requestClose} disabled={!!saving}>
                Cancel
              </Button>
              <Button type="submit" form="new-journal-form" variant="outline" loading={saving === "draft"} disabled={!!saving}>
                {saving !== "draft" && <Save aria-hidden />}
                Save draft
              </Button>
              <Button type="button" onClick={() => void save(true)} loading={saving === "post"} disabled={!!saving}>
                {saving !== "post" && <Send aria-hidden />}
                Save &amp; post
              </Button>
            </div>
          </DialogStickyFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={close}
        title="Discard this journal?"
        description="The lines you entered haven't been saved. Save a draft to keep them."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="destructive"
      />
    </>
  )
}
