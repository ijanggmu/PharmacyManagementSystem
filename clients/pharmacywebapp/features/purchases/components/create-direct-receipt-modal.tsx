"use client"

/**
 * "Record supplier bill": stock received from a supplier without a purchase order (a direct goods receipt),
 * entered line by line as printed on the bill — batch, expiry, quantity (in units or packs), free (bonus)
 * quantity, rate, trade discount and VAT — with a bill-level cash/trade discount and live totals. The server
 * stocks paid + free units at the effective cost and posts the payable/voucher from the discounted bill.
 */

import { BillDueDateField } from "@/components/shared/bill-due-date-field"
import { dueDateError, resolveBillDueDate } from "@/lib/utils/payment-terms"
import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { SupplierSelect } from "@/features/suppliers/components/supplier-select"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { purchasesApi, type DirectReceiptLineInput } from "@/features/purchases/api-client"
import { PriceCurrencyToggle } from "@/features/medicines/components/price-entry-controls"
import { priceTextInNpr, type PriceCurrency } from "@/features/medicines/lib/price-entry"
import { useCurrency } from "@/lib/contexts/currency-context"
import {
  billDiscountBody,
  computePurchaseBill,
  purchaseLineTermsBody,
  type DiscountMode,
  type PurchaseLineEntry,
} from "@/features/purchases/lib/purchase-bill-totals"
import {
  DiscountField,
  PurchaseBillTotalsPanel,
  UnitToggle,
  toNumber,
} from "@/features/purchases/components/purchase-line-terms"

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "credit", label: "On credit (pay later)" },
  { value: "cash", label: "Paid in cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "fonepay", label: "Fonepay" },
]

interface ReceiptLineRow {
  id: string
  medicine_id: string
  batch_number: string
  expiry_date: string
  quantity: string
  free_quantity: string
  in_packs: boolean
  in_boxes: boolean
  rate: string
  discount_mode: DiscountMode
  discount_value: string
  /** Blank = the VAT rate on the line's taxable value. */
  vat_amount: string
  selling_price: string
  /** Currency the rate and the selling price were typed in; INR is converted to NPR (1.60) when saved. */
  rate_currency: PriceCurrency
  selling_currency: PriceCurrency
}

const emptyLine = (): ReceiptLineRow => ({
  id: crypto.randomUUID(),
  medicine_id: "",
  batch_number: "",
  expiry_date: "",
  quantity: "",
  free_quantity: "",
  in_packs: false,
  in_boxes: false,
  rate: "",
  discount_mode: "percent",
  discount_value: "",
  vat_amount: "",
  selling_price: "",
  rate_currency: "NPR",
  selling_currency: "NPR",
})

type CreateReceiptPayload = { body: Parameters<typeof purchasesApi.createDirectReceipt>[0]; idempotencyKey: string }

export default function CreateDirectReceiptModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: vatRatePercent } = useVatRate()
  const keys = useRef(createIdempotencyKeyTracker())

  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [medicineSearching, setMedicineSearching] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  /** The chosen supplier's default credit days (undefined until a supplier is picked). */
  const [supplierCreditDays, setSupplierCreditDays] = useState<number | null | undefined>(undefined)
  /** A due date picked for this bill; "" = the supplier's terms decide. */
  const [dueDateOverride, setDueDateOverride] = useState("")
  const [receiptDate, setReceiptDate] = useState(formatLocalDateYmd(new Date()))
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [payment, setPayment] = useState("credit")
  const [lines, setLines] = useState<ReceiptLineRow[]>([emptyLine()])
  const [billDiscountMode, setBillDiscountMode] = useState<DiscountMode>("percent")
  const [billDiscountValue, setBillDiscountValue] = useState("")
  const [vatBill, setVatBill] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setSupplierId("")
    setSupplierCreditDays(undefined)
    setDueDateOverride("")
    setReceiptDate(formatLocalDateYmd(new Date()))
    setInvoiceNumber("")
    setPayment("credit")
    setLines([emptyLine()])
    setBillDiscountMode("percent")
    setBillDiscountValue("")
    setVatBill(true)
    setError(null)
    void medicinesApi.getMedicines({ limit: 200, sortBy: "name", sortOrder: "asc" }).then((res) => {
      if (!cancelled) setMedicines(res.data || [])
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleMedicineSearch = async (query: string) => {
    if (!query) return
    setMedicineSearching(true)
    try {
      const res = await medicinesApi.getMedicines({ search: query, limit: 50 })
      setMedicines((prev) => [...prev, ...(res.data || []).filter((m) => !prev.some((p) => p.id === m.id))])
    } finally {
      setMedicineSearching(false)
    }
  }

  const updateLine = (id: string, patch: Partial<ReceiptLineRow>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  /** "+ New medicine" on a line: which line, and the name typed so far. */
  const [newMedicine, setNewMedicine] = useState<{ lineId: string; name: string } | null>(null)
  const handleMedicineCreated = async (created?: { id: string; name: string }) => {
    const target = newMedicine
    setNewMedicine(null)
    if (!created || !target) return
    // The full record (prices, VAT, pack size) so the line works it out like any other medicine.
    const { data } = await medicinesApi.getMedicine(created.id)
    const medicine = data ?? (created as Medicine)
    setMedicines((prev) => (prev.some((m) => m.id === medicine.id) ? prev : [...prev, medicine]))
    updateLine(target.lineId, { medicine_id: medicine.id })
  }

  const medicineById = useMemo(() => new Map(medicines.map((m) => [m.id, m])), [medicines])
  // INR entry only makes sense for a pharmacy that keeps its books in NPR.
  const allowInr = useCurrency().currentCurrency.code === "NPR"
  /** The line's rate in NPR (as typed when the line is in NPR). */
  const rateOf = (l: ReceiptLineRow) => toNumber(priceTextInNpr(l.rate, l.rate_currency))
  const entryOf = (l: ReceiptLineRow): PurchaseLineEntry => {
    const medicine = medicineById.get(l.medicine_id)
    const unitsPerPack = medicine?.units_per_pack ?? null
    return {
      quantity: toNumber(l.quantity),
      freeQuantity: toNumber(l.free_quantity),
      rate: rateOf(l),
      discountMode: l.discount_mode,
      discountValue: toNumber(l.discount_value),
      inPacks: l.in_packs && (unitsPerPack ?? 0) > 1,
      unitsPerPack,
      inBoxes: l.in_boxes,
      packsPerBox: medicine?.packs_per_box ?? null,
      isTaxable: vatBill && (medicine?.is_taxable ?? true),
      vatOverride: l.vat_amount.trim() === "" ? null : toNumber(l.vat_amount),
    }
  }
  // Only lines that will be saved count towards the bill (the server spreads the bill discount over them).
  const billLines = lines.filter((l) => l.medicine_id && toNumber(l.quantity) > 0 && toNumber(l.rate) > 0)
  const billEntries = billLines.map(entryOf)
  const totals = computePurchaseBill(
    billEntries,
    { discountMode: billDiscountMode, discountValue: toNumber(billDiscountValue) },
    vatRatePercent ?? 0,
  )
  const totalsById = new Map(billLines.map((l, i) => [l.id, totals.lines[i]]))

  const createMutation = useMutation({
    mutationFn: ({ body, idempotencyKey }: CreateReceiptPayload) => purchasesApi.createDirectReceipt(body, idempotencyKey),
    onSuccess: () => {
      keys.current.reset()
      void queryClient.invalidateQueries({ queryKey: ["purchases"] })
      toast({ title: "Supplier bill recorded", description: "Stock was added and the payable posted." })
      onCreated()
      onClose()
    },
    onError: (err: unknown) => {
      toast({ title: "Could not record the bill", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
    },
  })

  const validate = (): string | null => {
    if (!supplierId) return "Choose the supplier on the bill."
    // The bill number is what the VAT purchase register and the supplier's statement are matched on, and what
    // stops the same bill being entered twice.
    if (!invoiceNumber.trim()) return "Enter the supplier's bill / tax invoice number."
    const dueProblem = payment === "credit" ? dueDateError(receiptDate, dueDateOverride || null) : null
    if (dueProblem) return dueProblem
    if (billLines.length === 0) return "Add at least one medicine with a quantity and rate."
    for (const l of billLines) {
      const n = lines.indexOf(l) + 1
      if (!l.batch_number.trim()) return `Line ${n}: enter the batch number.`
      if (!l.expiry_date) return `Line ${n}: enter the expiry date.`
    }
    for (const [i, entry] of billEntries.entries()) {
      if (entry.discountMode === "percent" ? entry.discountValue > 100 : entry.discountValue > totals.lines[i].gross) {
        return `Line ${lines.indexOf(billLines[i]) + 1}: the discount is more than the line amount.`
      }
    }
    const bill = toNumber(billDiscountValue)
    if (billDiscountMode === "percent" ? bill > 100 : bill > totals.gross - totals.lineDiscount + 0.0001) {
      return "The bill discount is more than the bill amount."
    }
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validate()
    setError(problem)
    if (problem) return

    const items: DirectReceiptLineInput[] = billLines.map((l, i) => {
      const terms = purchaseLineTermsBody(billEntries[i])
      return {
        medicine_id: l.medicine_id,
        batch_number: l.batch_number,
        expiry_date: l.expiry_date,
        quantity: toNumber(l.quantity),
        unit_cost: rateOf(l),
        vat_amount: totals.lines[i].vat,
        selling_price: priceTextInNpr(l.selling_price, l.selling_currency, 2),
        free_quantity: terms.freeQuantity,
        discount_percent: terms.discountPercent,
        discount_amount: terms.discountAmount,
        in_packs: terms.inPacks,
        in_boxes: terms.inBoxes,
      }
    })
    const bill = billDiscountBody({ discountMode: billDiscountMode, discountValue: toNumber(billDiscountValue) })
    const body = {
      supplier_id: supplierId,
      receipt_date: receiptDate,
      supplier_invoice_number: invoiceNumber,
      items,
      payment_method: payment === "credit" ? null : payment,
      // Only a date picked on the bill is sent; otherwise the supplier's credit days decide on the server.
      due_date:
        payment === "credit"
          ? resolveBillDueDate({ billDate: receiptDate, creditDays: supplierCreditDays, override: dueDateOverride }).sendDueDate
          : null,
      bill_discount_percent: bill.billDiscountPercent,
      bill_discount_amount: bill.billDiscountAmount,
    }
    // The same bill submitted again (e.g. after a timeout) reuses its key, so it is recorded once.
    createMutation.mutate({ body, idempotencyKey: keys.current.keyFor(JSON.stringify(body)) })
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !createMutation.isPending && onClose()}>
        <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Record supplier bill</DialogTitle>
            <DialogDescription>
              Stock received without a purchase order. Enter each line as printed on the bill, including free
              (bonus) quantity and discounts.
            </DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <DialogScrollBody className="space-y-5 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="grn-supplier">Supplier</Label>
                  <SupplierSelect
                    id="grn-supplier"
                    value={supplierId}
                    onValueChange={(id, _name, option) => {
                      setSupplierId(id)
                      setSupplierCreditDays(option ? (option.credit_days ?? null) : undefined)
                    }}
                    placeholder="Choose supplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grn-date">Bill date</Label>
                  <DatePicker id="grn-date" value={receiptDate} onChange={setReceiptDate} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grn-invoice">
                    Supplier invoice no. <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <Input
                    id="grn-invoice"
                    value={invoiceNumber}
                    maxLength={128}
                    aria-required
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="grn-payment">Payment</Label>
                  <Select value={payment} onValueChange={setPayment}>
                    <SelectTrigger id="grn-payment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {payment === "credit" && (
                  <div className="md:col-span-2">
                    <BillDueDateField
                      id="grn-due-date"
                      billDate={receiptDate}
                      creditDays={supplierId ? supplierCreditDays : undefined}
                      override={dueDateOverride}
                      onOverrideChange={setDueDateOverride}
                    />
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[13rem]">Medicine</TableHead>
                      <TableHead className="w-28 min-w-32">Batch</TableHead>
                      <TableHead className="w-36 min-w-36">Expiry</TableHead>
                      <TableHead className="w-20 min-w-24 text-right">Qty</TableHead>
                      <TableHead className="w-24 min-w-24">Unit</TableHead>
                      <TableHead className="w-20 min-w-20 text-right" title="Free (bonus) quantity, e.g. the 1 of a 10+1 scheme">Free</TableHead>
                      <TableHead className="w-24 min-w-24 text-right">Rate</TableHead>
                      <TableHead className="w-32 min-w-32">Disc.</TableHead>
                      <TableHead className="w-24 min-w-24 text-right" title="VAT on the value after discounts; blank = the VAT rate">VAT</TableHead>
                      <TableHead className="w-24 min-w-24 text-right" title="Per unit; blank = the medicine's price">Selling</TableHead>
                      <TableHead className="w-28 text-right">Amount</TableHead>
                      <TableHead className="w-24 text-right" title="Cost of each unit put into stock, free ones included">Cost/unit</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Remove</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const n = index + 1
                      const medicine = medicineById.get(line.medicine_id)
                      const lineTotals = totalsById.get(line.id)
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <MedicineCombobox
                              medicines={medicines}
                              value={line.medicine_id}
                              onValueChange={(v) => updateLine(line.id, { medicine_id: v })}
                              placeholder="Search medicine..."
                              onSearchChange={handleMedicineSearch}
                              isSearching={medicineSearching}
                              onCreateNew={(text) => setNewMedicine({ lineId: line.id, name: text })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={line.batch_number}
                              maxLength={64}
                              aria-label={`Batch number, line ${n}`}
                              onChange={(e) => updateLine(line.id, { batch_number: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <DatePicker
                              value={line.expiry_date}
                              aria-label={`Expiry date, line ${n}`}
                              onChange={(v) => updateLine(line.id, { expiry_date: v })}
                              presets={EXPIRY_PRESETS}
                              allowFuture
                              placeholder="Expiry"
                              compact
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              inputMode="decimal"
                              value={line.quantity}
                              aria-label={`Quantity, line ${n}`}
                              className="num text-right"
                              onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <UnitToggle
                              label={`Unit, line ${n}`}
                              inPacks={line.in_packs}
                              inBoxes={line.in_boxes}
                              unitsPerPack={medicine?.units_per_pack}
                              packsPerBox={medicine?.packs_per_box}
                              unitLabel={medicine?.unit_label}
                              form={medicine?.form}
                              boxLabel={medicine?.box_label}
                              onChange={(inPacks, inBoxes) => updateLine(line.id, { in_packs: inPacks, in_boxes: inBoxes })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              inputMode="decimal"
                              placeholder="0"
                              value={line.free_quantity}
                              aria-label={`Free quantity, line ${n}`}
                              className="num text-right"
                              onChange={(e) => updateLine(line.id, { free_quantity: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                            <Input
                              inputMode="decimal"
                              value={line.rate}
                              aria-label={`${line.in_boxes ? "Rate per box" : line.in_packs ? "Rate per pack" : "Rate"}, line ${n}`}
                              className="num min-w-[5.5rem] text-right"
                              onChange={(e) => updateLine(line.id, { rate: e.target.value })}
                            />
                            {allowInr && (
                              <PriceCurrencyToggle
                                label={`Rate currency, line ${n}`}
                                value={line.rate_currency}
                                onChange={(rate_currency) => updateLine(line.id, { rate_currency })}
                                className="w-[4.75rem]"
                              />
                            )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <DiscountField
                              label={`Discount, line ${n}`}
                              mode={line.discount_mode}
                              value={line.discount_value}
                              onModeChange={(mode) => updateLine(line.id, { discount_mode: mode })}
                              onValueChange={(value) => updateLine(line.id, { discount_value: value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              inputMode="decimal"
                              placeholder={lineTotals ? String(lineTotals.vat) : "0"}
                              value={line.vat_amount}
                              disabled={!vatBill || medicine?.is_taxable === false}
                              aria-label={`VAT amount, line ${n}`}
                              className="num text-right"
                              onChange={(e) => updateLine(line.id, { vat_amount: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                            <Input
                              inputMode="decimal"
                              placeholder="Price"
                              value={line.selling_price}
                              aria-label={`Selling price per unit, line ${n}`}
                              className="num min-w-[5.5rem] text-right"
                              onChange={(e) => updateLine(line.id, { selling_price: e.target.value })}
                            />
                            {allowInr && (
                              <PriceCurrencyToggle
                                label={`Selling price currency, line ${n}`}
                                value={line.selling_currency}
                                onChange={(selling_currency) => updateLine(line.id, { selling_currency })}
                                className="w-[4.75rem]"
                              />
                            )}
                            </div>
                          </TableCell>
                          <TableCell className="num whitespace-nowrap text-right font-medium">
                            <CurrencyDisplay amount={lineTotals?.taxable ?? 0} />
                          </TableCell>
                          <TableCell className="num whitespace-nowrap text-right text-muted-foreground">
                            {lineTotals ? <CurrencyDisplay amount={lineTotals.effectiveUnitCost} /> : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                              aria-label={`Remove line ${n}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                <Plus aria-hidden />
                Add line
              </Button>

              <PurchaseBillTotalsPanel
                idPrefix="grn"
                totals={totals}
                billDiscountMode={billDiscountMode}
                billDiscountValue={billDiscountValue}
                onBillDiscountModeChange={setBillDiscountMode}
                onBillDiscountValueChange={setBillDiscountValue}
                vatBill={vatBill}
                onVatBillChange={setVatBill}
                vatRatePercent={vatRatePercent ?? 0}
                note="Selling price is always per unit, even on a line entered in packs."
              />

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </DialogScrollBody>

            <DialogStickyFooter className="flex-col-reverse sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending} loadingText="Saving…">
                Record bill
              </Button>
            </DialogStickyFooter>
          </form>
        </DialogContent>
      </Dialog>
      <CreateMedicineModal
        isOpen={newMedicine !== null}
        onClose={() => setNewMedicine(null)}
        onCreate={(created) => void handleMedicineCreated(created)}
        initialName={newMedicine?.name}
        cardOnly
      />
    </>
  )
}
