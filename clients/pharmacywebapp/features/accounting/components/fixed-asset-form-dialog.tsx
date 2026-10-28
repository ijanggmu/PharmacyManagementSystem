"use client"

/**
 * Add / edit a fixed asset (Accounting › Fixed assets). Adding posts the acquisition voucher (Dr Fixed Assets + Input
 * VAT / Cr Cash-Bank, Accounts Payable or opening equity); editing never posts and, once depreciation has been posted,
 * only changes the descriptive fields (the API refuses new depreciation terms then).
 */

import { useMemo, useRef, useState } from "react"
import { Armchair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
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
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { cn } from "@/lib/utils"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { SupplierCombobox } from "@/features/suppliers/components/supplier-combobox"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useFixedAssetMutations, useTaxPools } from "@/features/accounting/hooks/use-fixed-assets"
import { usePaymentAccountFor } from "@/features/accounting/hooks/use-payment-accounts"
import { usePaymentPartySearch } from "@/features/accounting/hooks/use-payment-parties"
import {
  ASSET_CATEGORY_PRESETS,
  applyCategoryPreset,
  assetCostOf,
  emptyFixedAssetForm,
  estimatedAnnualDepreciation,
  fixedAssetFormFrom,
  hasFixedAssetErrors,
  METHOD_LABEL,
  SOURCE_LABEL,
  validateFixedAssetForm,
  type AcquisitionSource,
  type DepreciationMethod,
  type FixedAsset,
  type FixedAssetFormValues,
  type TaxPoolCode,
} from "@/features/accounting/lib/fixed-assets"
import { PARTY_PAYMENT_METHODS } from "@/features/accounting/lib/payment-methods"

export interface FixedAssetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The asset to edit; absent to add one. */
  asset?: FixedAsset | null
  branches: { id: string; name: string; code: string }[]
}

const CUSTOM_CATEGORY = "__custom__"

export function FixedAssetFormDialog({ open, onOpenChange, asset, branches }: FixedAssetFormDialogProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const editing = !!asset
  const termsLocked = !!asset?.has_posted_depreciation
  // Mounted fresh each time it opens (the caller renders it only while open), so initial state is the reset.
  const [values, setValues] = useState<FixedAssetFormValues>(() =>
    asset ? fixedAssetFormFrom(asset) : emptyFixedAssetForm(formatLocalDateYmd(new Date()))
  )
  const [customCategory, setCustomCategory] = useState(() => !ASSET_CATEGORY_PRESETS.some((p) => p.category === values.category))
  const [supplierSearch, setSupplierSearch] = useState("")
  const [touched, setTouched] = useState(false)
  const keys = useRef(createIdempotencyKeyTracker())
  const pools = useTaxPools().data ?? []
  const suppliers = usePaymentPartySearch("payment", supplierSearch, open && !editing && values.source === "supplier")
  const methodAccount = usePaymentAccountFor(values.payment_method || "bank")
  const { create, update } = useFixedAssetMutations()

  const busy = create.isPending || update.isPending
  const errors = validateFixedAssetForm(values, editing ? "edit" : "create")
  const show = (key: keyof FixedAssetFormValues) => (touched ? errors[key] : undefined)
  const set = <K extends keyof FixedAssetFormValues>(key: K, value: FixedAssetFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const cost = assetCostOf(values)
  const annual = estimatedAnnualDepreciation(values)
  const supplierOptions = useMemo(
    () => (suppliers.data?.items ?? []).map((s) => ({ id: s.id, name: s.name, phone: s.detail })),
    [suppliers.data]
  )

  const submit = () => {
    setTouched(true)
    if (hasFixedAssetErrors(errors)) return
    const onError = (e: unknown) =>
      toast({ title: editing ? "Couldn't save the asset" : "Couldn't add the asset", description: apiRequestErrorMessage(e), variant: "destructive" })
    if (asset) {
      update.mutate(
        { id: asset.id, values },
        {
          onSuccess: (_d, vars) => {
            toast({ title: "Asset updated", description: vars.values.name.trim() })
            onOpenChange(false)
          },
          onError,
        }
      )
      return
    }
    // Per-call data through mutate(vars); the key is reused when the same submission is retried.
    create.mutate(
      { values, idempotency_key: keys.current.keyFor(JSON.stringify(values)) },
      {
        onSuccess: (_d, vars) => {
          keys.current.reset()
          toast({ title: "Asset added", description: `${vars.values.name.trim()} — acquisition posted to the ledger.` })
          onOpenChange(false)
        },
        onError,
      }
    )
  }

  const field = (id: string, label: string, key: keyof FixedAssetFormValues, opts: { required?: boolean; help?: string; numeric?: boolean; placeholder?: string } = {}) => (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {opts.required && <span className="text-destructive" aria-hidden>*</span>}
      </Label>
      <Input
        id={id}
        inputMode={opts.numeric ? "decimal" : undefined}
        className={opts.numeric ? "num text-right" : undefined}
        value={values[key] as string}
        placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value as never)}
        disabled={busy}
        aria-invalid={!!show(key) || undefined}
        aria-describedby={`${id}-error`}
      />
      {opts.help && <p className="text-xs text-muted-foreground">{opts.help}</p>}
      <div id={`${id}-error`}>
        <FieldError message={show(key)} />
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-2xl")} showCloseButton={!busy}>
        <DialogHeader className="px-6 pb-2 pt-6 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Armchair className="h-4 w-4 text-primary" aria-hidden />
            {editing ? "Edit fixed asset" : "Add fixed asset"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? termsLocked
                ? "Depreciation has been posted for this asset, so only its name, category, tag, location and notes can change."
                : "Cost and how it was paid are fixed by the acquisition voucher — delete the asset and add it again to change them."
              : "Adds the asset to the register and posts its purchase. Its cost excludes the VAT claimed as input VAT."}
          </DialogDescription>
        </DialogHeader>

        <DialogScrollBody className="py-4">
          <form
            id="fixed-asset-form"
            className="space-y-6"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
              <legend className="mb-2 text-sm font-medium">Asset</legend>
              {field("fa-name", "Name", "name", { required: true, placeholder: "e.g. Dell Latitude laptop" })}
              <div className="space-y-2">
                <Label htmlFor="fa-category">
                  Category <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Select
                  value={customCategory ? CUSTOM_CATEGORY : values.category}
                  onValueChange={(v) => {
                    if (v === CUSTOM_CATEGORY) {
                      setCustomCategory(true)
                      set("category", "")
                    } else {
                      setCustomCategory(false)
                      setValues((prev) => (termsLocked ? { ...prev, category: v } : applyCategoryPreset(prev, v)))
                    }
                  }}
                >
                  <SelectTrigger id="fa-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORY_PRESETS.map((p) => (
                      <SelectItem key={p.category} value={p.category}>
                        {p.category}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CATEGORY}>Other…</SelectItem>
                  </SelectContent>
                </Select>
                {customCategory && (
                  <Input
                    aria-label="Category name"
                    value={values.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="Category name"
                    aria-invalid={!!show("category") || undefined}
                  />
                )}
                <FieldError message={show("category")} />
              </div>
              {field("fa-tag", "Asset tag", "asset_tag", { placeholder: "Optional, e.g. FA-014" })}
              {field("fa-location", "Location", "location", { placeholder: "Optional, e.g. Counter 2" })}
              {!editing && branches.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="fa-branch">Branch</Label>
                  <Select value={values.branch_id || "current"} onValueChange={(v) => set("branch_id", v === "current" ? "" : v)}>
                    <SelectTrigger id="fa-branch" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current branch</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </fieldset>

            {!editing && (
              <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
                <legend className="mb-2 text-sm font-medium">Acquisition</legend>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fa-source">How it was acquired</Label>
                  <Select value={values.source} onValueChange={(v) => set("source", v as AcquisitionSource)}>
                    <SelectTrigger id="fa-source" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SOURCE_LABEL) as AcquisitionSource[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SOURCE_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fa-date">
                    Acquisition date <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <DatePicker
                    id="fa-date"
                    value={values.acquisition_date}
                    onChange={(v) => set("acquisition_date", v)}
                    aria-invalid={!!show("acquisition_date") || undefined}
                  />
                  <FieldError message={show("acquisition_date")} />
                </div>
                {field("fa-amount", values.source === "opening" ? "Original cost" : "Bill amount (incl. VAT)", "amount", { required: true, numeric: true })}
                {values.source !== "opening" && (
                  <>
                    {field("fa-vat", "VAT on the bill", "vat_amount", { numeric: true, help: "Claimed as input VAT; leave blank for a non-VAT bill." })}
                    {field("fa-bill", "Bill number", "bill_number")}
                  </>
                )}
                {values.source === "cash_bank" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fa-method">Paid by</Label>
                      <Select value={values.payment_method} onValueChange={(v) => set("payment_method", v)}>
                        <SelectTrigger id="fa-method" className="w-full">
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
                      <p className="text-xs text-muted-foreground">
                        Credits {methodAccount.name} ({methodAccount.code}).
                      </p>
                    </div>
                    {field("fa-vendor", "Seller", "vendor_name", { placeholder: "Optional" })}
                    {field("fa-vatno", "Seller's VAT / PAN no.", "supplier_vat_number")}
                  </>
                )}
                {values.source === "supplier" && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="fa-supplier">
                      Supplier <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <SupplierCombobox
                      id="fa-supplier"
                      suppliers={supplierOptions}
                      value={values.supplier_id}
                      onValueChange={(v) => set("supplier_id", v)}
                      onSearchChange={setSupplierSearch}
                      isSearching={suppliers.isFetching}
                      isLoading={suppliers.isLoading}
                      placeholder="Search suppliers"
                    />
                    <p className="text-xs text-muted-foreground">Credits Accounts Payable; the bill is paid through supplier payments.</p>
                    <FieldError message={show("supplier_id")} />
                  </div>
                )}
                {values.source === "opening" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fa-golive">
                        Go-live date <span className="text-destructive" aria-hidden>*</span>
                      </Label>
                      <DatePicker id="fa-golive" value={values.go_live_date} onChange={(v) => set("go_live_date", v)} />
                      <p className="text-xs text-muted-foreground">Depreciation in the books starts in this month.</p>
                      <FieldError message={show("go_live_date")} />
                    </div>
                    {field("fa-openacc", "Depreciation to date", "opening_accumulated", { numeric: true })}
                    {field("fa-taxwdv", "Tax written-down value", "opening_tax_wdv", {
                      numeric: true,
                      help: "Its share of the pool's tax WDV at the start of the go-live year; blank = its book value.",
                    })}
                  </>
                )}
              </fieldset>
            )}

            <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy || termsLocked}>
              <legend className="mb-2 text-sm font-medium">Depreciation</legend>
              <div className="space-y-2">
                <Label htmlFor="fa-dep-method">Book method</Label>
                <Select value={values.method} onValueChange={(v) => set("method", v as DepreciationMethod)}>
                  <SelectTrigger id="fa-dep-method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(METHOD_LABEL) as DepreciationMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {values.method === "straight_line"
                ? field("fa-life", "Useful life (years)", "useful_life_years", { required: true, numeric: true })
                : field("fa-rate", "Rate per year (%)", "rate_percent", { required: true, numeric: true })}
              {field("fa-residual", "Residual value", "residual_value", { numeric: true, help: "Left undepreciated; usually 0." })}
              <div className="space-y-2">
                <Label htmlFor="fa-pool">Tax pool (Schedule 2)</Label>
                <Select value={values.tax_pool} onValueChange={(v) => set("tax_pool", v as TaxPoolCode)}>
                  <SelectTrigger id="fa-pool" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.name}
                        {p.per_asset_useful_life ? "" : ` · ${p.rate_percent}%`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {values.tax_pool === "E" && field("fa-taxlife", "Tax useful life (years)", "tax_useful_life_years", { required: true, numeric: true })}
              {!termsLocked && cost > 0 && annual > 0 && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Cost {money(cost)} · about {money(annual)} a year ({money(Math.round(annual * 100 / 12) / 100)} a month) in the first year.
                </p>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="fa-notes">Notes</Label>
              <Textarea id="fa-notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} disabled={busy} />
              <FieldError message={show("notes")} />
            </div>
          </form>
        </DialogScrollBody>

        <DialogStickyFooter className="flex-col-reverse sm:flex-row">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="fixed-asset-form" loading={busy} loadingText={editing ? "Saving…" : "Posting…"}>
            {editing ? "Save" : "Add asset"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}
