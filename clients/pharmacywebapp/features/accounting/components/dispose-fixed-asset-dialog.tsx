"use client"

/**
 * Sell or write off a fixed asset. Posts Dr Accumulated Depreciation + Dr Cash/Bank (proceeds) + Dr Loss / Cr Fixed
 * Assets + Cr Gain. The API refuses it until depreciation is posted up to the month before the disposal month.
 */

import { useRef, useState } from "react"
import { PackageMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { useFixedAssetMutations } from "@/features/accounting/hooks/use-fixed-assets"
import {
  disposalGainLoss,
  validateDisposalForm,
  type DisposalFormValues,
  type DisposalKind,
  type FixedAsset,
} from "@/features/accounting/lib/fixed-assets"
import { PARTY_PAYMENT_METHODS } from "@/features/accounting/lib/payment-methods"

export interface DisposeFixedAssetDialogProps {
  asset: FixedAsset
  onOpenChange: (open: boolean) => void
}

export function DisposeFixedAssetDialog({ asset, onOpenChange }: DisposeFixedAssetDialogProps) {
  const { toast } = useToast()
  const { money } = useAccountingMoney()
  const [values, setValues] = useState<DisposalFormValues>(() => ({
    kind: "sale",
    date: formatLocalDateYmd(new Date()),
    proceeds: "",
    payment_method: "cash",
    notes: "",
  }))
  const [touched, setTouched] = useState(false)
  const keys = useRef(createIdempotencyKeyTracker())
  const { dispose } = useFixedAssetMutations()
  const busy = dispose.isPending
  const errors = validateDisposalForm(values, asset.acquisition_date)
  const show = (k: keyof DisposalFormValues) => (touched ? errors[k] : undefined)
  const set = <K extends keyof DisposalFormValues>(k: K, v: DisposalFormValues[K]) => setValues((p) => ({ ...p, [k]: v }))
  const gainLoss = disposalGainLoss(asset.net_book_value, values.kind, values.proceeds)

  const submit = () => {
    setTouched(true)
    if (Object.values(errors).some(Boolean)) return
    dispose.mutate(
      { id: asset.id, values, idempotency_key: keys.current.keyFor(JSON.stringify(values)) },
      {
        onSuccess: (_d, vars) => {
          keys.current.reset()
          toast({
            title: vars.values.kind === "sale" ? "Asset sold" : "Asset written off",
            description: `${asset.name} — disposal posted to the ledger.`,
          })
          onOpenChange(false)
        },
        onError: (e) => toast({ title: "Couldn't dispose of the asset", description: apiRequestErrorMessage(e), variant: "destructive" }),
      }
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <PackageMinus className="h-4 w-4 text-primary" aria-hidden />
            Dispose of {asset.name}
          </DialogTitle>
          <DialogDescription>
            Removes its cost ({money(asset.cost)}) and accumulated depreciation ({money(asset.accumulated_depreciation)}) and books
            the gain or loss. Run depreciation up to the month before the disposal first.
          </DialogDescription>
        </DialogHeader>

        <form
          id="dispose-fixed-asset-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="fa-dispose-kind">Disposal</Label>
            <Select value={values.kind} onValueChange={(v) => set("kind", v as DisposalKind)} disabled={busy}>
              <SelectTrigger id="fa-dispose-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">Sold</SelectItem>
                <SelectItem value="write_off">Written off / scrapped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fa-dispose-date">
              Date <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <DatePicker id="fa-dispose-date" value={values.date} onChange={(v) => set("date", v)} disabled={busy} min={asset.acquisition_date} />
            <FieldError message={show("date")} />
          </div>
          {values.kind === "sale" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fa-dispose-proceeds">
                  Sale proceeds (excl. VAT) <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Input
                  id="fa-dispose-proceeds"
                  inputMode="decimal"
                  className="num text-right"
                  value={values.proceeds}
                  onChange={(e) => set("proceeds", e.target.value)}
                  disabled={busy}
                  aria-invalid={!!show("proceeds") || undefined}
                />
                <FieldError message={show("proceeds")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fa-dispose-method">Received by</Label>
                <Select value={values.payment_method} onValueChange={(v) => set("payment_method", v)} disabled={busy}>
                  <SelectTrigger id="fa-dispose-method" className="w-full">
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
              </div>
            </>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fa-dispose-notes">Notes</Label>
            <Input id="fa-dispose-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} disabled={busy} placeholder="Optional, e.g. buyer" />
            <FieldError message={show("notes")} />
          </div>
          <p className="text-sm sm:col-span-2" aria-live="polite">
            Book value now <span className="num font-medium">{money(asset.net_book_value)}</span> ·{" "}
            {gainLoss >= 0 ? "Gain" : "Loss"} <span className={`num font-medium ${gainLoss < 0 ? "text-destructive" : "text-success"}`}>{money(Math.abs(gainLoss))}</span>
            <span className="block text-xs text-muted-foreground">
              Estimated from the depreciation posted so far; the API recomputes it on the disposal date.
            </span>
          </p>
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="dispose-fixed-asset-form" loading={busy} loadingText="Posting…">
            {values.kind === "sale" ? "Record sale" : "Write off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
