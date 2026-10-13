"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Info, Search, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DatePicker, formatBsLabel } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { InlineAlert } from "@/features/accounting/components/accounting-ui"
import type { AccountingAccount } from "@/features/accounting/api-client"
import type { OpeningBalanceState } from "@/features/accounting/api-client-opening-balances"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useOpeningBalanceMutations } from "@/features/accounting/hooks/use-opening-balances"
import {
  SIDE_LABEL,
  amountError,
  buildDiff,
  computeTotals,
  draftToLines,
  formatNepaliAmount,
  groupAccounts,
  linesToDraft,
  naturalSideFor,
  openingDateError,
  parseAmountToPaisa,
  type BalanceSide,
  type LabelledLine,
  type OpeningDraft,
} from "@/features/accounting/lib/opening-balances"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { OpeningDiffList } from "./opening-diff-list"

type Step = 1 | 2 | 3

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Go-live date" },
  { n: 2, label: "Balances" },
  { n: 3, label: "Review & post" },
]

const MAX_REASON = 500

interface OpeningBalanceWizardProps {
  mode: "set" | "edit"
  branchId: string
  branchName: string
  accounts: AccountingAccount[]
  /** Current state: prefills Edit and supplies the equity account + lock date. */
  state: OpeningBalanceState
  onDone: () => void
  onCancel?: () => void
}

function draftStorageKey(branchId: string) {
  return `pharmacare.opening-balances.draft.${branchId}`
}

/**
 * Three-step setup used for both Set (first time / after reset) and Edit: go-live date, balances by
 * section with a live sticky total, then review and post. Edit posts a replacement voucher; the
 * server reverses the current one in the same transaction.
 */
export function OpeningBalanceWizard({ mode, branchId, branchName, accounts, state, onDone, onCancel }: OpeningBalanceWizardProps) {
  const { toast } = useToast()
  const { symbol } = useAccountingMoney()
  const { set, edit } = useOpeningBalanceMutations()
  const today = formatLocalDateYmd(new Date())

  const [step, setStep] = useState<Step>(1)
  const [date, setDate] = useState(mode === "edit" ? (state.openingDate ?? "") : "")
  const [draft, setDraft] = useState<OpeningDraft>(() => (mode === "edit" ? linesToDraft(state.lines) : {}))
  const [reason, setReason] = useState("")
  const [search, setSearch] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // One id per submission attempt: a retry after a timeout reuses it, so the server posts once.
  const requestIdRef = useRef<string | null>(null)
  const restoredRef = useRef(false)

  // Set mode keeps an unsent draft in this browser so a reload doesn't lose typed figures.
  useEffect(() => {
    if (mode !== "set" || restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = window.localStorage.getItem(draftStorageKey(branchId))
      if (!raw) return
      const saved = JSON.parse(raw) as { date?: string; draft?: OpeningDraft }
      if (saved.date) setDate(saved.date)
      if (saved.draft) setDraft(saved.draft)
    } catch {
      // Storage unavailable or corrupt: start empty.
    }
  }, [mode, branchId])

  useEffect(() => {
    if (mode !== "set" || !restoredRef.current) return
    try {
      window.localStorage.setItem(draftStorageKey(branchId), JSON.stringify({ date, draft }))
    } catch {
      // Best effort only.
    }
  }, [mode, branchId, date, draft])

  // Any change to the figures is a new submission.
  useEffect(() => {
    requestIdRef.current = null
    setSubmitError(null)
  }, [date, draft, reason])

  // AR, AP and Inventory openings come from customer/supplier opening balances and opening stock, so they're
  // hidden here — except when the current opening already carries one (set before that rule): Edit can keep or clear it.
  const legacyControlIds = useMemo(
    () => new Set(mode === "edit" ? state.lines.map((l) => l.accountId) : []),
    [mode, state.lines],
  )
  const groups = useMemo(() => groupAccounts(accounts, legacyControlIds), [accounts, legacyControlIds])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const { lines, invalid } = useMemo(() => draftToLines(draft), [draft])
  const totals = useMemo(() => computeTotals(lines), [lines])

  const dateError = openingDateError(date, today)
  const lockError =
    state.postingLockDate && date && date <= state.postingLockDate
      ? `The books are locked up to ${state.postingLockDate}. Pick a later date or move the posting lock first.`
      : null
  const editLockError =
    mode === "edit" && state.postingLockDate && state.openingDate && state.openingDate <= state.postingLockDate
      ? `The current opening date (${state.openingDate}) is in a locked period, so it can't be reversed. Move the posting lock date back first.`
      : null

  const labelled: LabelledLine[] = lines.map((l) => {
    const a = accountById.get(l.accountId)
    return { ...l, accountCode: a?.code ?? "?", accountName: a?.name ?? "Unknown account" }
  })
  const diff = mode === "edit" ? buildDiff(state.lines, labelled) : []
  const dateChanged = mode === "edit" && date !== state.openingDate
  const nothingChanged = mode === "edit" && diff.length === 0 && !dateChanged

  const setRow = (accountId: string, patch: Partial<{ amount: string; side: BalanceSide }>, fallbackSide: BalanceSide) =>
    setDraft((prev) => {
      const current = prev[accountId] ?? { amount: "", side: fallbackSide }
      return { ...prev, [accountId]: { ...current, ...patch } }
    })

  const goToStep2 = () => {
    if (dateError || lockError) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep(2)
  }

  const goToStep3 = () => {
    if (invalid.length > 0 || lines.length === 0) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep(3)
  }

  const submit = () => {
    if (mode === "edit" && !reason.trim()) {
      setShowErrors(true)
      return
    }
    requestIdRef.current ??= crypto.randomUUID()
    const requestId = requestIdRef.current
    const onError = (error: unknown) => setSubmitError(apiRequestErrorMessage(error) || "Could not post opening balances.")

    if (mode === "set") {
      set.mutate(
        { requestId, branchId, openingDate: date, lines, reason: reason.trim() || null },
        {
          onSuccess: () => {
            try {
              window.localStorage.removeItem(draftStorageKey(branchId))
            } catch {
              // ignore
            }
            toast({ title: "Opening balances posted", description: `${branchName} is live from ${date}.` })
            onDone()
          },
          onError,
        },
      )
    } else {
      edit.mutate(
        { requestId, branchId, expectedVersion: state.version, openingDate: date, lines, reason: reason.trim() },
        {
          onSuccess: () => {
            toast({ title: "Opening balances updated", description: "The previous opening voucher was reversed and a new one posted." })
            onDone()
          },
          onError,
        },
      )
    }
  }

  const pending = set.isPending || edit.isPending
  const q = search.trim().toLowerCase()

  return (
    <div className="min-w-0 space-y-5">
      <StepIndicator step={step} />

      {editLockError && <InlineAlert tone="warning" title="This period is locked">{editLockError}</InlineAlert>}

      {step === 1 && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="font-display text-base font-semibold">When do you start recording here?</h3>
                <p className="text-sm text-muted-foreground">
                  Your go-live date is the first day you record sales and purchases in this system. Enter what the pharmacy
                  had and owed at the <span className="font-medium text-foreground">start</span> of that day, usually the
                  closing figures from your old books for the day before. Everything before this date stays in your old books.
                </p>
              </div>
            </div>

            <div className="max-w-xs space-y-2">
              <Label htmlFor="opening-date">
                Go-live date <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <DatePicker
                id="opening-date"
                value={date}
                onChange={setDate}
                max={today}
                aria-required
                aria-invalid={showErrors && !!(dateError || lockError)}
                aria-describedby="opening-date-help opening-date-error"
              />
              <p id="opening-date-help" className="text-xs text-muted-foreground">
                Branch: <span className="font-medium text-foreground">{branchName}</span>. Opening balances are kept per branch.
              </p>
              {showErrors && (dateError || lockError) && (
                <p id="opening-date-error" className="text-xs font-medium text-destructive" role="alert">
                  {dateError ?? lockError}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              {onCancel && (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="button" onClick={goToStep2}>
                Next: enter balances
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Type each balance as at <span className="num font-medium text-foreground">{date}</span>. Each amount is either{" "}
              <SideChip side="debit" /> or <SideChip side="credit" />; the usual side is preselected. Leave anything you
              don&apos;t have blank.
            </p>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an account"
                aria-label="Find an account"
                className="pl-8"
              />
            </div>
          </div>

          {groups.map(({ section, accounts: sectionAccounts }) => {
            const visible = q
              ? sectionAccounts.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
              : sectionAccounts
            if (q && visible.length === 0) return null
            const sectionTotals = computeTotals(lines.filter((l) => sectionAccounts.some((a) => a.id === l.accountId)))
            const sectionNet = Math.abs(sectionTotals.difference)
            return (
              <Card key={section.id} className="overflow-hidden">
                <div className="flex flex-col gap-1 border-b bg-muted/40 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-semibold">{section.title}</h3>
                    <p className="text-xs text-muted-foreground">{section.hint}</p>
                  </div>
                  <p className="num shrink-0 text-sm font-medium tabular-nums sm:pt-0.5">
                    {sectionNet > 0 ? `${symbol} ${formatNepaliAmount(sectionNet)}` : <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
                {visible.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No accounts here yet. Add one under Chart of accounts if you need it.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {visible.map((a) => {
                      const natural = naturalSideFor(a)
                      const row = draft[a.id] ?? { amount: "", side: natural }
                      const err = amountError(row.amount)
                      const inputId = `ob-amount-${a.id}`
                      return (
                        <li key={a.id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-start sm:gap-3">
                          <label htmlFor={inputId} className="min-w-0 pt-0.5 sm:pt-2">
                            <span className="num mr-2 text-xs text-muted-foreground">{a.code}</span>
                            <span className="text-sm font-medium">{a.name}</span>
                            {row.side !== natural && parseAmountToPaisa(row.amount) ? (
                              <span className="mt-0.5 block text-xs text-warning">
                                Unusual side for this account (e.g. an overdraft). Check it&apos;s right.
                              </span>
                            ) : null}
                          </label>
                          <div className="space-y-1">
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden>
                                {symbol}
                              </span>
                              <Input
                                id={inputId}
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="0.00"
                                value={row.amount}
                                onChange={(e) => setRow(a.id, { amount: e.target.value }, natural)}
                                onFocus={(e) => setRow(a.id, { amount: e.target.value.replace(/,/g, "") }, natural)}
                                onBlur={(e) => {
                                  const paisa = parseAmountToPaisa(e.target.value)
                                  if (paisa !== null && !amountError(e.target.value))
                                    setRow(a.id, { amount: paisa ? formatNepaliAmount(paisa / 100) : "" }, natural)
                                }}
                                aria-invalid={!!err}
                                aria-describedby={err ? `${inputId}-err` : undefined}
                                className="num pl-8 text-right tabular-nums"
                              />
                            </div>
                            {err && (
                              <p id={`${inputId}-err`} className="text-xs font-medium text-destructive">
                                {err}
                              </p>
                            )}
                          </div>
                          <SideToggle
                            value={row.side}
                            onChange={(side) => setRow(a.id, { side }, natural)}
                            label={`${a.code} ${a.name} side`}
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
                {section.id === "equity" && (
                  <p className="flex items-start gap-2 border-t bg-info/5 px-4 py-2.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
                    <span>
                      Whatever doesn&apos;t balance is posted to{" "}
                      <span className="num font-medium text-foreground">{state.equityAccountCode}</span>{" "}
                      {state.equityAccountName ?? "Owner's Equity"} automatically, so you don&apos;t need to work it out.
                    </span>
                  </p>
                )}
              </Card>
            )
          })}

          {showErrors && (invalid.length > 0 || lines.length === 0) && (
            <InlineAlert tone="destructive">
              {lines.length === 0 && invalid.length === 0
                ? "Enter at least one balance to continue."
                : `Fix ${invalid.length} amount${invalid.length === 1 ? "" : "s"} marked in red to continue.`}
            </InlineAlert>
          )}

          <TotalsFooter
            symbol={symbol}
            totals={totals}
            equityLabel={`${state.equityAccountCode} ${state.equityAccountName ?? "Owner's Equity"}`}
            actions={
              <>
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft aria-hidden />
                  Back
                </Button>
                <Button type="button" onClick={goToStep3}>
                  Review
                  <ArrowRight aria-hidden />
                </Button>
              </>
            }
          />
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div>
              <h3 className="font-display text-base font-semibold">Check and post</h3>
              <p className="text-sm text-muted-foreground">
                {mode === "set"
                  ? "This posts one opening voucher. You can edit or reset it later; every change is kept in the history."
                  : `The current opening voucher ${state.voucherNo ?? ""} will be reversed (it stays on record) and a new one posted with these figures, in one step.`}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Branch</dt>
                <dd className="font-medium">{branchName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Go-live date</dt>
                <dd className="num font-medium">
                  {date}
                  {formatBsLabel(date) && <span className="ml-1 text-xs font-normal text-muted-foreground">({formatBsLabel(date)} BS)</span>}
                  {dateChanged && <span className="ml-1 text-xs font-normal text-muted-foreground">was {state.openingDate}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Accounts</dt>
                <dd className="num font-medium">{lines.length}</dd>
              </div>
            </dl>

            <ReviewTable symbol={symbol} lines={labelled} totals={totals} equityCode={state.equityAccountCode} equityName={state.equityAccountName} />

            {mode === "edit" && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">What changes</h4>
                {nothingChanged ? (
                  <InlineAlert tone="info">Nothing has changed yet. Go back and adjust the date or an amount.</InlineAlert>
                ) : diff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Only the go-live date changes.</p>
                ) : (
                  <OpeningDiffList rows={diff} symbol={symbol} />
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="opening-reason">
                {mode === "edit" ? (
                  <>
                    Reason for the change <span className="text-destructive" aria-hidden>*</span>
                  </>
                ) : (
                  "Note (optional)"
                )}
              </Label>
              <Textarea
                id="opening-reason"
                value={reason}
                maxLength={MAX_REASON}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                placeholder={mode === "edit" ? "e.g. Stock recount found 3,500 more in inventory" : "e.g. Figures from the 2082/83 closing balance sheet"}
                aria-invalid={mode === "edit" && showErrors && !reason.trim()}
                aria-required={mode === "edit"}
              />
              {mode === "edit" && showErrors && !reason.trim() && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  A reason is required. It is saved in the history.
                </p>
              )}
            </div>

            {submitError && (
              <InlineAlert tone="destructive" title="Not posted">
                {submitError}
              </InlineAlert>
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={pending}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
              <Button
                type="button"
                variant="success"
                onClick={submit}
                loading={pending}
                loadingText="Posting…"
                disabled={nothingChanged || !!editLockError}
              >
                <Send aria-hidden />
                {mode === "set" ? "Post opening balances" : "Reverse & post new figures"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s) => {
          const done = s.n < step
          const current = s.n === step
          return (
            <li key={s.n} aria-current={current ? "step" : undefined} className="min-w-0">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  done ? "bg-success" : current ? "bg-primary" : "bg-muted",
                )}
                aria-hidden
              />
              <p className={cn("mt-2 flex items-center gap-1.5 truncate text-xs", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> : <span className="num">{s.n}.</span>}
                {s.label}
                {done && <span className="sr-only">(done)</span>}
              </p>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function SideChip({ side }: { side: BalanceSide }) {
  return (
    <span className="whitespace-nowrap">
      <span className="rounded bg-muted px-1 py-0.5 text-xs font-semibold text-foreground">{SIDE_LABEL[side].short}</span>{" "}
      <span className="text-foreground">{SIDE_LABEL[side].plain}</span>
    </span>
  )
}

function SideToggle({ value, onChange, label }: { value: BalanceSide; onChange: (side: BalanceSide) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-10 w-full rounded-md border bg-muted/40 p-0.5 sm:h-9 sm:w-auto">
      {(["debit", "credit"] as const).map((side) => (
        <button
          key={side}
          type="button"
          aria-pressed={value === side}
          onClick={() => onChange(side)}
          title={`${SIDE_LABEL[side].short}: ${SIDE_LABEL[side].plain}`}
          className={cn(
            "flex-1 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
            value === side ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="font-semibold">{SIDE_LABEL[side].short}</span>
          <span className="ml-1">{side === "debit" ? "have" : "owe"}</span>
        </button>
      ))}
    </div>
  )
}

/** Live totals pinned to the bottom of the viewport while entering balances. */
function TotalsFooter({
  symbol,
  totals,
  equityLabel,
  actions,
}: {
  symbol: string
  totals: ReturnType<typeof computeTotals>
  equityLabel: string
  actions: ReactNode
}) {
  const adj = totals.equityAdjustment
  return (
    <div className="sticky bottom-0 z-20 -mx-1 rounded-t-xl border bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <dl className="grid grid-cols-3 gap-3 text-sm lg:flex lg:gap-8" aria-live="polite">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Total debit</dt>
            <dd className="num truncate text-xs font-semibold tabular-nums sm:text-sm">{symbol} {formatNepaliAmount(totals.debit)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Total credit</dt>
            <dd className="num truncate text-xs font-semibold tabular-nums sm:text-sm">{symbol} {formatNepaliAmount(totals.credit)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Difference</dt>
            <dd className="num truncate text-xs font-semibold tabular-nums sm:text-sm">{symbol} {formatNepaliAmount(Math.abs(totals.difference))}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {totals.debit === 0 && totals.credit === 0 ? (
            <p className="text-xs text-muted-foreground" role="status">
              Nothing entered yet.
            </p>
          ) : totals.balanced ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Balanced
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground sm:max-w-xs" role="status">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
              <span>
                <span className="num font-medium text-foreground">
                  {symbol} {formatNepaliAmount(adj?.amount ?? 0)}
                </span>{" "}
                will be posted to {equityLabel} as a {adj?.side === "credit" ? "credit (owner's stake)" : "debit"}.
              </span>
            </p>
          )}
          <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">{actions}</div>
        </div>
      </div>
    </div>
  )
}

function ReviewTable({
  symbol,
  lines,
  totals,
  equityCode,
  equityName,
}: {
  symbol: string
  lines: LabelledLine[]
  totals: ReturnType<typeof computeTotals>
  equityCode: string
  equityName: string | null
}) {
  const sorted = [...lines].sort((a, b) => a.accountCode.localeCompare(b.accountCode, "en", { numeric: true }))
  const adj = totals.equityAdjustment
  const finalDebit = totals.debit + (adj?.side === "debit" ? adj.amount : 0)
  const finalCredit = totals.credit + (adj?.side === "credit" ? adj.amount : 0)
  const cell = "num whitespace-nowrap px-3 py-2 text-right tabular-nums"
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">Opening voucher lines</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Account</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Debit ({symbol})</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Credit ({symbol})</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((l) => (
            <tr key={l.accountId}>
              <td className="px-3 py-2">
                <span className="num mr-2 text-xs text-muted-foreground">{l.accountCode}</span>
                {l.accountName}
              </td>
              <td className={cell}>{l.debitAmount ? formatNepaliAmount(l.debitAmount) : ""}</td>
              <td className={cell}>{l.creditAmount ? formatNepaliAmount(l.creditAmount) : ""}</td>
            </tr>
          ))}
          {adj && (
            <tr className="bg-info/5">
              <td className="px-3 py-2">
                <span className="num mr-2 text-xs text-muted-foreground">{equityCode}</span>
                {equityName ?? "Owner's Equity"}
                <span className="ml-2 text-xs text-muted-foreground">balancing difference</span>
              </td>
              <td className={cell}>{adj.side === "debit" ? formatNepaliAmount(adj.amount) : ""}</td>
              <td className={cell}>{adj.side === "credit" ? formatNepaliAmount(adj.amount) : ""}</td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-foreground/15 bg-muted/60 font-semibold">
          <tr>
            <td className="px-3 py-2">
              Total <span className="ml-1 text-xs font-normal text-success">balanced</span>
            </td>
            <td className={cell}>{formatNepaliAmount(finalDebit)}</td>
            <td className={cell}>{formatNepaliAmount(finalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
