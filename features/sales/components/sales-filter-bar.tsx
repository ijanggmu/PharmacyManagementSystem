"use client"

import { useState, type ReactNode } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DateRangePicker } from "@/components/date-range-picker"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { CustomerCombobox } from "@/features/customers/components/customer-combobox"
import { cn } from "@/lib/utils"
import type { Sale, SalePaymentStatusFilter } from "@/features/sales/api-client"
import { SALES_SORT_OPTIONS } from "@/features/sales/lib/sales-list-filters"

export const PAYMENT_STATUS_OPTIONS: { value: SalePaymentStatusFilter; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Unpaid / partly paid" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
]

export const PAYMENT_METHOD_OPTIONS: { value: Sale["payment_method"]; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "fonepay", label: "Fonepay" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "bank", label: "Bank transfer" },
  { value: "credit", label: "Credit (AR)" },
  { value: "insurance", label: "Insurance" },
  { value: "mixed", label: "Split payment" },
  { value: "other", label: "Other" },
]

const ALL_BRANCHES = "__all__"
const ANY_CASHIER = "__any__"

interface Option {
  id: string
  name: string
}

export interface SalesFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  dateRange?: { from: Date; to: Date }
  onDateRangeChange: (range: { from: Date; to: Date } | undefined) => void
  sort: string
  onSortChange: (value: string) => void

  medicineId: string
  onMedicineChange: (id: string) => void
  medicines: { id: string; name: string; generic_name?: string | null; stock_quantity?: number }[]
  onMedicineSearch: (query: string) => void | Promise<void>
  medicineSearching: boolean

  /** Hidden when the page is already scoped to one customer. */
  showCustomer: boolean
  customerId: string
  onCustomerChange: (id: string) => void
  customers: { id: string; first_name: string; last_name: string; phone?: string | null }[]
  onCustomerSearch: (query: string) => void | Promise<void>
  customerSearching: boolean

  /** Shown only to users who may view every branch. */
  showBranch: boolean
  branchId: string
  onBranchChange: (id: string) => void
  branches: Option[]

  /** Hidden when no cashier list could be loaded (e.g. no permission to list users). */
  cashierId: string
  onCashierChange: (id: string) => void
  cashiers: Option[]

  balanceDueOnly: boolean
  onBalanceDueOnlyChange: (value: boolean) => void

  paymentStatuses: SalePaymentStatusFilter[]
  onPaymentStatusesChange: (values: SalePaymentStatusFilter[]) => void
  paymentMethods: Sale["payment_method"][]
  onPaymentMethodsChange: (values: Sale["payment_method"][]) => void

  minAmount: string
  maxAmount: string
  onMinAmountChange: (value: string) => void
  onMaxAmountChange: (value: string) => void
  amountRangeInvalid: boolean

  onClearAll: () => void
  /** Matching sales for the current filters (shown on the sheet's done button). */
  resultCount?: number
  isFetching?: boolean
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** A pill that toggles one value of a multi-choice filter; announced as a pressed/unpressed button. */
function TogglePill({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        pressed
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  )
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate font-medium" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}: ${value}`}
        className="ml-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  )
}

/**
 * Sales history filters. The everyday controls (search, date range, sort) stay on the bar; the rest
 * live in a labelled "Filters" sheet. Every active filter shows as a removable chip, and every change
 * applies at once (the list refetches; the sheet's button shows the live result count).
 */
export function SalesFilterBar(props: SalesFilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const {
    search, onSearchChange, dateRange, onDateRangeChange, sort, onSortChange,
    medicineId, onMedicineChange, medicines, onMedicineSearch, medicineSearching,
    showCustomer, customerId, onCustomerChange, customers, onCustomerSearch, customerSearching,
    showBranch, branchId, onBranchChange, branches,
    cashierId, onCashierChange, cashiers, balanceDueOnly, onBalanceDueOnlyChange,
    paymentStatuses, onPaymentStatusesChange, paymentMethods, onPaymentMethodsChange,
    minAmount, maxAmount, onMinAmountChange, onMaxAmountChange, amountRangeInvalid,
    onClearAll, resultCount, isFetching,
  } = props

  const medicineName = medicines.find((m) => m.id === medicineId)?.name ?? "Selected medicine"
  const customer = customers.find((c) => c.id === customerId)
  const customerName = customer ? `${customer.first_name} ${customer.last_name}`.trim() : "Selected customer"
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Selected branch"
  const cashierName = cashiers.find((c) => c.id === cashierId)?.name ?? "Selected cashier"
  const amountLabel =
    minAmount.trim() && maxAmount.trim()
      ? `${minAmount} – ${maxAmount}`
      : minAmount.trim()
        ? `≥ ${minAmount}`
        : maxAmount.trim()
          ? `≤ ${maxAmount}`
          : ""

  // Filters that live in the sheet (drives the button's badge).
  const sheetFilterCount =
    (medicineId ? 1 : 0) +
    (customerId ? 1 : 0) +
    (branchId ? 1 : 0) +
    (cashierId ? 1 : 0) +
    (balanceDueOnly ? 1 : 0) +
    paymentStatuses.length +
    paymentMethods.length +
    (amountLabel ? 1 : 0)

  const chips: { key: string; label: string; value: string; onRemove: () => void }[] = []
  if (search.trim()) chips.push({ key: "search", label: "Search", value: search.trim(), onRemove: () => onSearchChange("") })
  if (dateRange)
    chips.push({
      key: "date",
      label: "Date",
      value: `${formatDay(dateRange.from)} – ${formatDay(dateRange.to)}`,
      onRemove: () => onDateRangeChange(undefined),
    })
  if (medicineId) chips.push({ key: "medicine", label: "Medicine", value: medicineName, onRemove: () => onMedicineChange("") })
  if (customerId) chips.push({ key: "customer", label: "Customer", value: customerName, onRemove: () => onCustomerChange("") })
  if (branchId) chips.push({ key: "branch", label: "Branch", value: branchName, onRemove: () => onBranchChange("") })
  if (cashierId) chips.push({ key: "cashier", label: "Cashier", value: cashierName, onRemove: () => onCashierChange("") })
  if (balanceDueOnly)
    chips.push({ key: "balance", label: "Balance", value: "Due only", onRemove: () => onBalanceDueOnlyChange(false) })
  for (const s of paymentStatuses)
    chips.push({
      key: `status-${s}`,
      label: "Status",
      value: PAYMENT_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s,
      onRemove: () => onPaymentStatusesChange(paymentStatuses.filter((v) => v !== s)),
    })
  for (const m of paymentMethods)
    chips.push({
      key: `method-${m}`,
      label: "Payment",
      value: PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m,
      onRemove: () => onPaymentMethodsChange(paymentMethods.filter((v) => v !== m)),
    })
  if (amountLabel)
    chips.push({
      key: "amount",
      label: "Total",
      value: amountLabel,
      onRemove: () => {
        onMinAmountChange("")
        onMaxAmountChange("")
      },
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Invoice no., customer, phone or notes"
            aria-label="Search sales by invoice number, customer, phone or notes"
            className="h-10 pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
            className="col-span-2 sm:col-span-1 [&_button]:h-10 [&_button]:w-full sm:[&_button]:w-[230px]"
          />
          <Select value={sort} onValueChange={onSortChange}>
            <SelectTrigger className="h-10 w-full sm:w-[190px]" aria-label="Sort sales">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SALES_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={sheetFilterCount > 0 ? "secondary" : "outline"}
            className="h-10 gap-2"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {sheetFilterCount > 0 && (
              <Badge className="num h-5 min-w-5 justify-center rounded-full px-1.5" aria-label={`${sheetFilterCount} active`}>
                {sheetFilterCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} value={chip.value} onRemove={chip.onRemove} />
          ))}
          <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Filter sales</SheetTitle>
            <SheetDescription>Changes apply right away. Remove any filter from the list using its chip.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <div className="space-y-2">
              <Label htmlFor="sales-filter-medicine">Medicine sold</Label>
              <MedicineCombobox
                id="sales-filter-medicine"
                medicines={medicines}
                value={medicineId}
                onValueChange={onMedicineChange}
                placeholder="Any medicine"
                className="h-10 w-full"
                onSearchChange={onMedicineSearch}
                isSearching={medicineSearching}
              />
              <p className="text-xs text-muted-foreground">Shows sales with at least one line of this medicine.</p>
            </div>

            {showCustomer && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <CustomerCombobox
                  customers={customers}
                  value={customerId}
                  onValueChange={onCustomerChange}
                  placeholder="Any customer"
                  className="h-10 w-full"
                  onSearchChange={onCustomerSearch}
                  isSearching={customerSearching}
                />
              </div>
            )}

            {showBranch && (
              <div className="space-y-2">
                <Label htmlFor="sales-filter-branch">Branch</Label>
                <Select value={branchId || ALL_BRANCHES} onValueChange={(v) => onBranchChange(v === ALL_BRANCHES ? "" : v)}>
                  <SelectTrigger id="sales-filter-branch" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cashiers.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="sales-filter-cashier">Cashier</Label>
                <Select value={cashierId || ANY_CASHIER} onValueChange={(v) => onCashierChange(v === ANY_CASHIER ? "" : v)}>
                  <SelectTrigger id="sales-filter-cashier" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_CASHIER}>Any cashier</SelectItem>
                    {cashiers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="sales-filter-balance-due" className="cursor-pointer">
                  Balance due only
                </Label>
                <p id="sales-filter-balance-due-hint" className="text-xs text-muted-foreground">
                  Credit and part-paid sales the customer still owes on.
                </p>
              </div>
              <Switch
                id="sales-filter-balance-due"
                checked={balanceDueOnly}
                onCheckedChange={onBalanceDueOnlyChange}
                aria-describedby="sales-filter-balance-due-hint"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Payment status</legend>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <TogglePill
                    key={o.value}
                    pressed={paymentStatuses.includes(o.value)}
                    onClick={() => onPaymentStatusesChange(toggle(paymentStatuses, o.value))}
                  >
                    {o.label}
                  </TogglePill>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Payment method</legend>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <TogglePill
                    key={o.value}
                    pressed={paymentMethods.includes(o.value)}
                    onClick={() => onPaymentMethodsChange(toggle(paymentMethods, o.value))}
                  >
                    {o.label}
                  </TogglePill>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">A method also matches split payments that used it.</p>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Sale total</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sales-filter-min" className="text-xs text-muted-foreground">
                    Minimum
                  </Label>
                  <Input
                    id="sales-filter-min"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={minAmount}
                    onChange={(e) => onMinAmountChange(e.target.value)}
                    placeholder="0"
                    aria-invalid={amountRangeInvalid || undefined}
                    aria-describedby={amountRangeInvalid ? "sales-filter-amount-error" : undefined}
                    className="num h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sales-filter-max" className="text-xs text-muted-foreground">
                    Maximum
                  </Label>
                  <Input
                    id="sales-filter-max"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={maxAmount}
                    onChange={(e) => onMaxAmountChange(e.target.value)}
                    placeholder="No limit"
                    aria-invalid={amountRangeInvalid || undefined}
                    aria-describedby={amountRangeInvalid ? "sales-filter-amount-error" : undefined}
                    className="num h-10"
                  />
                </div>
              </div>
              {amountRangeInvalid && (
                <p id="sales-filter-amount-error" role="alert" className="text-xs text-destructive">
                  The minimum is above the maximum, so the amount filter is ignored. Lower the minimum or raise the maximum.
                </p>
              )}
            </fieldset>
          </div>

          <SheetFooter className="flex-row gap-2 border-t">
            <Button type="button" variant="ghost" className="h-10 flex-1" onClick={onClearAll}>
              Clear all
            </Button>
            <Button type="button" className="h-10 flex-1" onClick={() => setSheetOpen(false)} aria-live="polite">
              {isFetching || resultCount === undefined
                ? "Show results"
                : `Show ${resultCount.toLocaleString()} ${resultCount === 1 ? "sale" : "sales"}`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
