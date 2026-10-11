"use client"

import { useEffect, useState } from "react"
import { Loader2, PackagePlus } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { BillPaymentFields } from "@/features/medicines/components/bill-payment-fields"
import { emptyBillPayment, toBillPaymentInput, validateBillPayment, type BillPaymentState } from "@/features/medicines/lib/bill-payment"
import { effectivePurchaseVat, suggestedPurchaseVat } from "@/features/medicines/lib/purchase-vat"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { suppliersApi } from "@/features/suppliers/api-client"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"

const NO_SUPPLIER = "__none__"

interface AddStockDialogProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
  onAdded: () => void
}

interface StockForm {
  quantity: string
  batchNumber: string
  expiryDate: string
  costPrice: string
  sellingPrice: string
  rackLocation: string
  supplierId: string
  invoiceNumber: string
  vatAmount: string
}

type StockErrors = Partial<Record<"quantity" | "expiryDate" | "costPrice" | "sellingPrice", string>>

/**
 * Receives a new batch of an existing medicine: quantity, batch number, expiry and prices, and
 * optionally the supplier bill it came on (payable, VAT, paid now or on credit). Without a supplier
 * it is opening stock the pharmacy already owns. A batch number that already exists at this branch
 * with the same expiry is topped up; with a different expiry the server refuses it.
 */
export function AddStockDialog({ medicine, isOpen, onClose, onAdded }: AddStockDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: vatRatePercent } = useVatRate()
  const [form, setForm] = useState<StockForm>(blankForm(null))
  const [errors, setErrors] = useState<StockErrors>({})
  const [vatEdited, setVatEdited] = useState(false)
  const [payment, setPayment] = useState<BillPaymentState>(emptyBillPayment)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(blankForm(medicine))
    setErrors({})
    setVatEdited(false)
    setPayment(emptyBillPayment())
    setPaymentError(null)
    void suppliersApi.getSupplierOptions().then(({ data }) => setSuppliers(data.filter((s) => s.is_active)))
  }, [isOpen, medicine])

  const quantity = Number.parseFloat(form.quantity) || 0
  const cost = Number.parseFloat(form.costPrice) || 0
  const isTaxable = medicine?.is_taxable !== false
  const hasSupplier = form.supplierId !== ""
  const suggestedVat = suggestedPurchaseVat(quantity, cost, vatRatePercent ?? 0, isTaxable)
  const enteredVat = vatEdited && form.vatAmount !== "" ? Number.parseFloat(form.vatAmount) : null
  const vat = hasSupplier ? effectivePurchaseVat(quantity, cost, vatRatePercent ?? 0, isTaxable, enteredVat) : 0
  const billTotal = Math.round((quantity * cost + vat) * 100) / 100
  const vatFieldValue = !isTaxable ? "0" : vatEdited ? form.vatAmount : suggestedVat > 0 ? String(suggestedVat) : ""

  const set = (patch: Partial<StockForm>) => setForm((prev) => ({ ...prev, ...patch }))

  const validate = (): StockErrors => {
    const next: StockErrors = {}
    if (!(quantity > 0)) next.quantity = "Enter how many units arrived."
    if (!form.expiryDate) next.expiryDate = "Enter the expiry date printed on the pack."
    if (form.costPrice !== "" && !(cost >= 0)) next.costPrice = "Cost can't be negative."
    if (form.sellingPrice !== "" && !((Number.parseFloat(form.sellingPrice) || 0) >= 0)) next.sellingPrice = "Price can't be negative."
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!medicine) return
    const nextErrors = validate()
    setErrors(nextErrors)
    const payError = hasSupplier ? validateBillPayment(payment, billTotal) : null
    setPaymentError(payError)
    if (Object.keys(nextErrors).length > 0 || payError) return

    setSaving(true)
    const { error } = await medicinesApi.addStockToExisting(medicine.id, {
      name: medicine.name,
      stock_quantity: quantity,
      batch_number: form.batchNumber.trim() || null,
      expiry_date: form.expiryDate,
      rack_location: form.rackLocation.trim() || null,
      cost_price: cost,
      unit_price: form.sellingPrice === "" ? null : Number.parseFloat(form.sellingPrice),
      supplier_id: hasSupplier ? form.supplierId : null,
      supplier_invoice_number: hasSupplier ? form.invoiceNumber.trim() || null : null,
      vat_amount: hasSupplier ? vat : null,
      payment: hasSupplier ? toBillPaymentInput(payment) : null,
    })
    setSaving(false)

    if (error) {
      toast({ title: "Couldn't add the stock", description: error, variant: "destructive" })
      return
    }

    queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
    queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
    if (hasSupplier) {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(form.supplierId) })
    }
    window.dispatchEvent(new CustomEvent("refresh-medicines"))
    window.dispatchEvent(new CustomEvent("refresh-data"))
    toast({ title: "Stock added", description: `${quantity} added to ${medicine.name}` })
    onAdded()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
          <DialogDescription>
            {medicine ? [medicine.name, medicine.strength, medicine.form].filter(Boolean).join(" · ") : ""} — a new batch, or more of a
            batch you already have here.
          </DialogDescription>
        </DialogHeader>

        <form id="add-stock-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-stock-quantity">Quantity received</Label>
              <Input
                id="add-stock-quantity"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => set({ quantity: e.target.value })}
                aria-invalid={!!errors.quantity}
              />
              <FieldError message={errors.quantity} />
            </div>
            <div>
              <Label htmlFor="add-stock-batch">Batch number</Label>
              <Input
                id="add-stock-batch"
                value={form.batchNumber}
                onChange={(e) => set({ batchNumber: e.target.value })}
                placeholder="As printed on the pack"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="add-stock-expiry">Expiry date</Label>
              <DatePicker
                id="add-stock-expiry"
                presets={EXPIRY_PRESETS}
                allowFuture
                value={form.expiryDate}
                onChange={(value) => set({ expiryDate: value })}
                aria-invalid={!!errors.expiryDate}
              />
              <FieldError message={errors.expiryDate} />
            </div>
            <div>
              <Label htmlFor="add-stock-rack">Rack location</Label>
              <Input id="add-stock-rack" value={form.rackLocation} onChange={(e) => set({ rackLocation: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="add-stock-cost">Cost per unit</Label>
              <Input
                id="add-stock-cost"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={form.costPrice}
                onChange={(e) => set({ costPrice: e.target.value })}
                aria-invalid={!!errors.costPrice}
              />
              <FieldError message={errors.costPrice} />
            </div>
            <div>
              <Label htmlFor="add-stock-selling">Selling price per unit</Label>
              <Input
                id="add-stock-selling"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={form.sellingPrice}
                onChange={(e) => set({ sellingPrice: e.target.value })}
                aria-invalid={!!errors.sellingPrice}
              />
              <FieldError message={errors.sellingPrice} />
            </div>
          </div>

          <div>
            <Label htmlFor="add-stock-supplier">Supplier</Label>
            <Select value={form.supplierId || NO_SUPPLIER} onValueChange={(v) => set({ supplierId: v === NO_SUPPLIER ? "" : v })}>
              <SelectTrigger id="add-stock-supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>No supplier (stock we already own)</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasSupplier
                ? "Records the supplier bill: the amount is owed to the supplier unless you mark it paid below."
                : "Recorded as opening stock: no supplier bill and nothing owed."}
            </p>
          </div>

          {hasSupplier && (
            <div className="space-y-4 rounded-md border p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="add-stock-invoice">Supplier invoice number</Label>
                  <Input id="add-stock-invoice" value={form.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="add-stock-vat">Input VAT</Label>
                  <Input
                    id="add-stock-vat"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={vatFieldValue}
                    disabled={!isTaxable}
                    onChange={(e) => {
                      setVatEdited(true)
                      set({ vatAmount: e.target.value })
                    }}
                  />
                </div>
              </div>
              <BillPaymentFields
                idPrefix="add-stock"
                value={payment}
                onChange={(next) => {
                  setPayment(next)
                  if (paymentError) setPaymentError(validateBillPayment(next, billTotal))
                }}
                total={billTotal}
                error={paymentError}
              />
            </div>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="add-stock-form" disabled={saving || !medicine}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <PackagePlus className="mr-1 size-4" />}
            Add stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function blankForm(medicine: Medicine | null): StockForm {
  return {
    quantity: "",
    batchNumber: "",
    expiryDate: "",
    costPrice: medicine && Number(medicine.cost_price) > 0 ? String(Number(medicine.cost_price)) : "",
    sellingPrice: medicine && Number(medicine.unit_price) > 0 ? String(Number(medicine.unit_price)) : "",
    rackLocation: "",
    supplierId: medicine?.supplier_id ?? "",
    invoiceNumber: "",
    vatAmount: "",
  }
}
