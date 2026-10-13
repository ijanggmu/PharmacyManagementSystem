"use client"

/**
 * "Record customer payment" (receipt, Receivables) and "Record supplier payment" (Payables) dialog.
 * Posts through the existing Customers/Suppliers payment endpoints, which post the GL voucher
 * (Dr cash / Cr AR 1100, or Dr AP 2000 / Cr cash) via their integration events.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown, HandCoins, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import {
  PARTY_SEARCH_PAGE_SIZE,
  usePaymentPartySearch,
  useRecordPartyPayment,
  type PaymentParty,
} from "@/features/accounting/hooks/use-payment-parties"
import { buildReferenceNote, validatePaymentForm, type PaymentKind } from "@/features/accounting/lib/payment-form"
import { InlineAlert } from "./accounting-ui"
import { PARTY_PAYMENT_METHODS, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"
import { usePaymentAccountFor } from "@/features/accounting/hooks/use-payment-accounts"
import { useSupplierOpenBills } from "@/features/suppliers/hooks/use-supplier-bills"
import { supplierBillLabel, type SupplierOpenBill } from "@/lib/api/suppliers-api"

/** Select value for "no specific bill" — the payment settles the oldest open bills first. */
const OLDEST_FIRST = "__oldest__"

export interface PaymentPartyPreset {
  id: string
  name: string
  /** Outstanding balance when the caller already knows it (e.g. from the aging row). */
  outstanding?: number | null
}

export interface RecordPaymentDialogProps {
  kind: PaymentKind
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Party to start with (aging-row "Receive"/"Pay"); the picker stays editable. */
  party?: PaymentPartyPreset | null
  /**
   * Supplier bill to settle ("Pay" on a bill row). The payment is applied to this bill, the amount
   * defaults to its outstanding and can't exceed it. The user can still switch to another open bill.
   */
  bill?: SupplierOpenBill | null
  /** Called after a successful post with the party it was posted for. */
  onRecorded?: (party: { id: string; name: string }) => void
}

const COPY = {
  receipt: {
    title: "Record customer payment",
    description: "Receipt against the customer's account. Posts Dr cash, Cr receivables (1100).",
    party: "Customer",
    search: "Search customers by name or phone…",
    method: "Received as",
    date: "Receipt date",
    submit: "Record receipt",
    success: "Customer receipt recorded",
    outstandingLabel: "Owes you",
    overpay: "This is more than the customer owes. The extra stays on their account as an advance (credit balance).",
    confirm: "Record the extra as an advance from the customer",
    icon: HandCoins,
  },
  payment: {
    title: "Record supplier payment",
    description: "Payment against the supplier's account. Posts Dr payables (2000), Cr cash.",
    party: "Supplier",
    search: "Search suppliers by name…",
    method: "Paid by",
    date: "Payment date",
    submit: "Record payment",
    success: "Supplier payment recorded",
    outstandingLabel: "You owe",
    overpay: "This is more than you owe the supplier. The extra stays on their account as an advance.",
    confirm: "Record the extra as an advance to the supplier",
    icon: Send,
  },
} as const

export function RecordPaymentDialog({ kind, open, onOpenChange, party, bill, onRecorded }: RecordPaymentDialogProps) {
  const copy = COPY[kind]
  const Icon = copy.icon
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const record = useRecordPartyPayment()

  const [selected, setSelected] = useState<PaymentPartyPreset | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PartyPaymentMethod>("cash")
  const methodAccount = usePaymentAccountFor(method)
  const [date, setDate] = useState(() => formatLocalDateYmd(new Date()))
  const [reference, setReference] = useState("")
  const [billNumber, setBillNumber] = useState("")
  const [billDate, setBillDate] = useState("")
  const [note, setNote] = useState("")
  const [touched, setTouched] = useState(false)
  const [advanceConfirmed, setAdvanceConfirmed] = useState(false)
  /** ledger_entry_id of the bill the payment is applied to; OLDEST_FIRST for none. */
  const [billKey, setBillKey] = useState<string>(OLDEST_FIRST)
  // One Idempotency-Key per payment: a retry of the same form values (after a timeout or error) reuses it,
  // so the receipt is recorded once; changed values or a new dialog get a fresh key.
  const paymentKeys = useRef(createIdempotencyKeyTracker())

  // Each open starts a fresh form, seeded from the row/bill that opened it.
  useEffect(() => {
    if (!open) return
    setSelected(party ?? null)
    setSearch("")
    setAmount(
      bill && bill.outstanding > 0
        ? bill.outstanding.toFixed(2)
        : party?.outstanding != null && party.outstanding > 0
          ? party.outstanding.toFixed(2)
          : ""
    )
    setMethod("cash")
    setDate(formatLocalDateYmd(new Date()))
    setReference("")
    setBillNumber("")
    setBillDate("")
    setBillKey(bill?.ledger_entry_id ?? OLDEST_FIRST)
    setNote("")
    setTouched(false)
    setAdvanceConfirmed(false)
    paymentKeys.current.reset()
  }, [open, party, bill])

  const parties = usePaymentPartySearch(kind, search, open && pickerOpen)
  const options = useMemo(() => parties.data?.items ?? [], [parties.data])

  const isSupplier = kind === "payment"
  const openBills = useSupplierOpenBills(isSupplier ? selected?.id : null, { enabled: open })
  const billOptions = useMemo(() => {
    const rows = (openBills.data?.bills ?? []).filter((b) => b.outstanding > 0.005)
    // The preset bill stays selectable even before the list loads.
    if (bill && !rows.some((b) => b.ledger_entry_id === bill.ledger_entry_id)) rows.unshift(bill)
    return rows
  }, [openBills.data, bill])
  const chosenBill = isSupplier ? billOptions.find((b) => b.ledger_entry_id === billKey) ?? null : null

  const outstanding = selected?.outstanding ?? null
  const today = formatLocalDateYmd(new Date())
  const result = validatePaymentForm(
    {
      partyId: selected?.id ?? "",
      amount,
      date,
      today,
      // Paying one bill is capped by that bill instead of warning about an advance.
      outstanding: chosenBill ? null : outstanding,
      billOutstanding: chosenBill?.outstanding ?? null,
      reference,
      note,
      billNumber,
      billDate,
      formatMoney: money,
    },
    kind
  )
  const { errors, overpaymentBy } = result
  const needsAdvanceConfirm = overpaymentBy != null && !advanceConfirmed
  const busy = record.isPending

  const choose = (p: PaymentParty) => {
    setSelected({ id: p.id, name: p.name, outstanding: p.outstanding })
    setAdvanceConfirmed(false)
    if (p.id !== selected?.id) setBillKey(OLDEST_FIRST)
    setPickerOpen(false)
  }

  const submit = () => {
    setTouched(true)
    if (!result.valid || !selected || needsAdvanceConfirm) return
    const partyRef = { id: selected.id, name: selected.name }
    const vars = {
      kind,
      partyId: selected.id,
      amount: result.amount,
      method,
      date,
      referenceNote: buildReferenceNote(
        chosenBill
          ? { reference, note, billNumber: chosenBill.supplier_bill_number ?? chosenBill.document_number ?? undefined }
          : { reference, note, billNumber, billDate }
      ),
      bill: chosenBill ? { referenceType: chosenBill.reference_type, referenceId: chosenBill.reference_id } : null,
    }
    record.mutate(
      // The key travels with this call's data; the same payment retried reuses it, so it posts once.
      { ...vars, idempotencyKey: paymentKeys.current.keyFor(JSON.stringify(vars)) },
      {
        onSuccess: () => {
          paymentKeys.current.reset()
          toast({
            title: copy.success,
            description: `${money(result.amount)} · ${partyRef.name}${chosenBill ? ` · ${supplierBillLabel(chosenBill)}` : ""}. The ledger voucher posts within a few seconds.`,
          })
          onOpenChange(false)
          onRecorded?.(partyRef)
        },
        onError: (e) => {
          toast({ title: `${copy.title} failed`, description: apiRequestErrorMessage(e), variant: "destructive" })
        },
      }
    )
  }

  const show = (msg: string | undefined) => (touched ? msg : undefined)

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form
          id={`record-${kind}-form`}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${kind}-party`}>
              {copy.party} <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={`${kind}-party`}
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  aria-invalid={!!show(errors.party) || undefined}
                  aria-describedby={`${kind}-party-help`}
                  disabled={busy}
                  className={cn(
                    "h-10 w-full min-w-0 justify-between px-3 font-normal",
                    !selected && "text-muted-foreground",
                    show(errors.party) && "border-destructive"
                  )}
                >
                  <span className="min-w-0 truncate text-left">{selected?.name ?? `Select ${copy.party.toLowerCase()}`}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(92vw,460px)] p-0" align="start">
                {/* Filtering is server-side, so cmdk's own filter is off. */}
                <Command shouldFilter={false}>
                  <CommandInput value={search} onValueChange={setSearch} placeholder={copy.search} />
                  <CommandList>
                    {parties.isLoading || (parties.isFetching && options.length === 0) ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Searching…
                      </div>
                    ) : parties.error ? (
                      <div className="px-3 py-6 text-center text-sm text-destructive">
                        Couldn&apos;t load {copy.party.toLowerCase()}s. {apiRequestErrorMessage(parties.error)}
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>No {copy.party.toLowerCase()} matches.</CommandEmpty>
                        <CommandGroup>
                          {options.map((p) => (
                            <CommandItem key={p.id} value={p.id} onSelect={() => choose(p)} className="cursor-pointer">
                              <Check className={cn("h-4 w-4", selected?.id === p.id ? "opacity-100" : "opacity-0")} aria-hidden />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate">{p.name}</span>
                                {p.detail && <span className="truncate text-xs text-muted-foreground">{p.detail}</span>}
                              </span>
                              <span
                                className={cn(
                                  "num shrink-0 text-xs",
                                  p.outstanding > 0.005 ? "font-medium text-foreground" : "text-muted-foreground"
                                )}
                              >
                                {p.outstanding > 0.005 ? money(p.outstanding) : "Settled"}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {(parties.data?.total ?? 0) > options.length && (
                          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                            Showing {options.length} of {parties.data?.total}. Keep typing to narrow the list.
                          </p>
                        )}
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div id={`${kind}-party-help`}>
              <FieldError message={show(errors.party)} />
            </div>
            {selected && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{copy.outstandingLabel}</span>
                {outstanding == null ? (
                  <span className="text-muted-foreground">Unknown</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className={cn("num font-semibold", outstanding < 0 && "text-success")}>
                      {outstanding < 0 ? `${money(-outstanding)} advance` : money(outstanding)}
                    </span>
                    {outstanding > 0.005 && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setAmount(outstanding.toFixed(2))}
                        disabled={busy}
                      >
                        Use full
                      </Button>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {isSupplier && selected && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="payment-apply-to">Apply payment to</Label>
              <Select
                value={billKey}
                onValueChange={(v) => {
                  setBillKey(v)
                  const next = billOptions.find((b) => b.ledger_entry_id === v)
                  if (next) setAmount(next.outstanding.toFixed(2))
                }}
                disabled={busy}
              >
                <SelectTrigger id="payment-apply-to" className="w-full" aria-describedby="payment-apply-to-help">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OLDEST_FIRST}>Oldest bills first (no specific bill)</SelectItem>
                  {billOptions.map((b) => (
                    <SelectItem key={b.ledger_entry_id} value={b.ledger_entry_id}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="truncate">{supplierBillLabel(b)}</span>
                        <span className="num text-xs text-muted-foreground">{money(b.outstanding)} due</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="payment-apply-to-help" className="text-xs text-muted-foreground">
                {openBills.isLoading
                  ? "Loading open bills…"
                  : openBills.error
                    ? "Couldn't load open bills — the payment will settle the oldest bills first."
                    : chosenBill
                      ? "The payment settles this bill only. It can't be more than what is still due on it."
                      : billOptions.length
                        ? `${billOptions.length} open bill${billOptions.length === 1 ? "" : "s"}. Without a bill, the payment settles the oldest ones first.`
                        : "No open bills. The payment is kept as an advance against future bills."}
              </p>
              {chosenBill && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Receipt no.</dt>
                    <dd className="truncate font-mono text-xs">{chosenBill.document_number ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Supplier bill</dt>
                    <dd className="truncate">{chosenBill.supplier_bill_number ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Bill amount</dt>
                    <dd className="num">{money(chosenBill.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Still due</dt>
                    <dd className="num font-semibold">{money(chosenBill.outstanding)}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${kind}-amount`}>
              Amount <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Input
              id={`${kind}-amount`}
              inputMode="decimal"
              autoComplete="off"
              className="num text-right"
              placeholder="0.00"
              value={amount}
              disabled={busy}
              aria-invalid={!!show(errors.amount) || undefined}
              aria-describedby={`${kind}-amount-error`}
              onChange={(e) => {
                setAmount(e.target.value)
                setAdvanceConfirmed(false)
              }}
            />
            <div id={`${kind}-amount-error`}>
              <FieldError message={show(errors.amount)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${kind}-method`}>{copy.method}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PartyPaymentMethod)} disabled={busy}>
              <SelectTrigger id={`${kind}-method`} className="w-full" aria-describedby={`${kind}-method-help`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTY_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id={`${kind}-method-help`} className="text-xs text-muted-foreground">
              The voucher posts to {methodAccount.name} ({methodAccount.code}).
            </p>
          </div>

          {overpaymentBy != null && (
            <div className="space-y-2 sm:col-span-2">
              <InlineAlert tone="warning" title={`${money(overpaymentBy)} more than outstanding`}>
                {copy.overpay}
              </InlineAlert>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={advanceConfirmed}
                  onChange={(e) => setAdvanceConfirmed(e.target.checked)}
                  disabled={busy}
                />
                {copy.confirm}
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${kind}-date`}>
              {copy.date} <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <DatePicker
              id={`${kind}-date`}
              value={date}
              onChange={setDate}
              disabled={busy}
              aria-invalid={!!show(errors.date) || undefined}
              aria-describedby={`${kind}-date-error`}
            />
            <div id={`${kind}-date-error`}>
              <FieldError message={show(errors.date)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${kind}-reference`}>Reference</Label>
            <Input
              id={`${kind}-reference`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque / transfer no."
              disabled={busy}
              maxLength={100}
            />
          </div>

          {kind === "payment" && !chosenBill && (
            <>
              <div className="space-y-2">
                <Label htmlFor="payment-bill-no">Supplier bill no.</Label>
                <Input
                  id="payment-bill-no"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="e.g. TAX-INV-1032"
                  disabled={busy}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-bill-date">Supplier bill date</Label>
                <DatePicker id="payment-bill-date" value={billDate} onChange={setBillDate} disabled={busy} clearable />
              </div>
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${kind}-note`}>Note</Label>
            <Textarea
              id={`${kind}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional"
              disabled={busy}
              aria-invalid={!!show(errors.description) || undefined}
              aria-describedby={`${kind}-note-error`}
            />
            <div id={`${kind}-note-error`}>
              <FieldError message={show(errors.description)} />
            </div>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={`record-${kind}-form`}
            loading={busy}
            loadingText="Posting…"
            disabled={touched && needsAdvanceConfirm}
          >
            {copy.submit}
          </Button>
        </DialogFooter>
        <p className="sr-only" aria-live="polite">
          {parties.data ? `${parties.data.items.length} of up to ${PARTY_SEARCH_PAGE_SIZE} ${copy.party.toLowerCase()}s listed` : ""}
        </p>
      </DialogContent>
    </Dialog>
  )
}
