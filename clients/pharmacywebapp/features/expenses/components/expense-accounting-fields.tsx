"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CurrencyDisplay } from "@/components/currency-display"
import { accountingApi } from "@/features/accounting/api-client"
import { AccountCombobox } from "@/features/accounting/components/account-combobox"
import { SupplierSelect } from "@/features/suppliers/components/supplier-select"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { TdsFields } from "@/features/accounting/components/tds-fields"
import { EMPTY_TDS } from "@/features/accounting/lib/tds"
import type { ExpensePaymentMethod } from "@/features/expenses/api-client"
import {
  expenseHeadAccounts,
  expenseVatSplit,
  GENERAL_EXPENSES_CODE,
  type ExpenseAccountingForm,
  type ExpenseSettlement,
  type ExpenseVatMode,
} from "@/features/expenses/lib/expense-form"
import { cn } from "@/lib/utils"

const VAT_NUMBER_MAX = 32

interface ExpenseAccountingFieldsProps {
  /** Prefix for element ids, so the create and edit dialogs don't collide. */
  idPrefix: string
  form: ExpenseAccountingForm
  onChange: (patch: Partial<ExpenseAccountingForm>) => void
  /** Gross amount as typed, for the net / VAT preview. */
  amount: number
  /** Editing: paid now vs pay later and the supplier can't change (the payable is already booked). */
  settlementLocked?: boolean
}

/**
 * The accounting part of the expense form: the expense account (Expense heads), the VAT bill (seller's VAT number,
 * VAT amount or "amount includes VAT") and how it is settled — paid now (method → Cash or Bank) or pay later
 * (owed to a supplier, paid later through supplier payments).
 */
export function ExpenseAccountingFields({ idPrefix, form, onChange, amount, settlementLocked = false }: ExpenseAccountingFieldsProps) {
  const accountsQuery = useQuery({
    queryKey: ["accounting", "accounts"],
    queryFn: () => accountingApi.getAccounts(),
    staleTime: 5 * 60 * 1000,
  })
  const vatRate = useVatRate()
  const heads = useMemo(() => expenseHeadAccounts(accountsQuery.data ?? []), [accountsQuery.data])
  const split = expenseVatSplit(amount, form, vatRate.data)
  const ratePercent = vatRate.data
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={id("account")}>Expense account</Label>
        <AccountCombobox
          id={id("account")}
          accounts={heads}
          value={form.accountId}
          onChange={(accountId) => onChange({ accountId })}
          placeholder={`${GENERAL_EXPENSES_CODE} General Expenses (default)`}
          disabled={accountsQuery.isLoading || accountsQuery.isError}
          aria-describedby={id("account-help")}
        />
        <p id={id("account-help")} className="text-xs text-muted-foreground">
          {accountsQuery.isError
            ? "Couldn't load the chart of accounts — the expense is booked to General Expenses."
            : "The ledger account the cost is booked to. The category stays as a label."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("settlement")}>Settlement</Label>
        <SegmentedChoice
          id={id("settlement")}
          value={form.settlement}
          disabled={settlementLocked}
          options={[
            { value: "paid", label: "Paid now" },
            { value: "later", label: "Pay later (supplier)" },
          ]}
          onChange={(settlement) => onChange({ settlement })}
        />
        {settlementLocked && (
          <p className="text-xs text-muted-foreground">
            {form.settlement === "later"
              ? "Owed to the supplier — its amount and date are on the supplier's ledger and can't be edited. Delete and re-record to change them."
              : "Delete and re-record the expense to put it on a supplier's account instead."}
          </p>
        )}
      </div>

      {form.settlement === "paid" ? (
        <div className="space-y-1.5">
          <Label htmlFor={id("payment")}>
            Payment method
            <span className="text-destructive" aria-hidden>
              {" "}
              *
            </span>
          </Label>
          <Select value={form.paymentMethod} onValueChange={(v) => onChange({ paymentMethod: v as ExpensePaymentMethod })}>
            <SelectTrigger id={id("payment")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={id("supplier")}>
            Supplier
            <span className="text-destructive" aria-hidden>
              {" "}
              *
            </span>
          </Label>
          <SupplierSelect
            id={id("supplier")}
            value={form.supplierId}
            includeInactive={settlementLocked}
            disabled={settlementLocked}
            onValueChange={(supplierId, supplierName) => onChange({ supplierId, supplierName })}
            placeholder={form.supplierName ?? "Choose supplier"}
            aria-required
            aria-describedby={id("supplier-help")}
          />
          <p id={id("supplier-help")} className="text-xs text-muted-foreground">
            Booked to Accounts Payable and added to the supplier&apos;s bills — pay it from the supplier&apos;s account.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("vat-mode")}>VAT bill</Label>
          <Select value={form.vatMode} onValueChange={(v) => onChange({ vatMode: v as ExpenseVatMode })}>
            <SelectTrigger id={id("vat-mode")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No VAT to claim</SelectItem>
              <SelectItem value="amount">VAT bill — enter the VAT amount</SelectItem>
              <SelectItem value="includes">
                VAT bill — amount includes {ratePercent ? `${ratePercent}%` : "the"} VAT
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.vatMode !== "none" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={id("vat-number")}>
                Seller VAT / PAN no.
                {form.settlement === "paid" && (
                  <span className="text-destructive" aria-hidden>
                    {" "}
                    *
                  </span>
                )}
              </Label>
              <Input
                id={id("vat-number")}
                value={form.supplierVatNumber}
                onChange={(e) => onChange({ supplierVatNumber: e.target.value })}
                maxLength={VAT_NUMBER_MAX}
                inputMode="numeric"
                placeholder={form.settlement === "later" ? "Supplier's on file if blank" : "e.g. 601234567"}
              />
            </div>
            {form.vatMode === "amount" ? (
              <div className="space-y-1.5">
                <Label htmlFor={id("vat-amount")}>
                  VAT amount
                  <span className="text-destructive" aria-hidden>
                    {" "}
                    *
                  </span>
                </Label>
                <Input
                  id={id("vat-amount")}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.vatAmount}
                  onChange={(e) => onChange({ vatAmount: e.target.value })}
                  placeholder="0.00"
                  className="num text-right"
                />
              </div>
            ) : (
              <p className="self-end pb-2 text-xs text-muted-foreground">
                {ratePercent ? `VAT is worked out at ${ratePercent}% of the amount.` : "The VAT rate isn't set in pharmacy settings."}
              </p>
            )}
          </div>
        )}
        {form.vatMode !== "none" && split && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Expense <CurrencyDisplay amount={split.net} /> + input VAT <CurrencyDisplay amount={split.vat} /> (claimable). The bill
            number goes in &ldquo;Bill / receipt no.&rdquo;
          </p>
        )}
      </div>

      <TdsFields
        idPrefix={idPrefix}
        value={form.tds ?? EMPTY_TDS}
        onChange={(tds) => onChange({ tds })}
        defaultTaxable={split?.net ?? amount}
        gross={amount}
        netLabel={form.settlement === "later" ? "Owed to the supplier" : "Paid to the vendor"}
        disabled={settlementLocked && form.settlement === "later"}
        lockedHint={
          settlementLocked && form.settlement === "later"
            ? "The TDS sets what is owed on the supplier's ledger and can't be edited — delete and re-record to change it."
            : undefined
        }
      />
    </div>
  )
}

function SegmentedChoice({
  id,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string
  value: ExpenseSettlement
  options: { value: ExpenseSettlement; label: string }[]
  onChange: (value: ExpenseSettlement) => void
  disabled?: boolean
}) {
  return (
    <div id={id} role="radiogroup" className="inline-flex w-full rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
