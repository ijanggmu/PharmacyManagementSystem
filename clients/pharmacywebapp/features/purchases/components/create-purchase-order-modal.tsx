"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { purchasesApi } from "@/features/purchases/api-client"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { SupplierSelect } from "@/features/suppliers/components/supplier-select"
import { supplierOptionKeys } from "@/features/suppliers/hooks/use-supplier-options"
import {
  buildLowStockLines,
  dominantSupplierId,
  loadLowStockMedicines,
  loadOnOrderQuantities,
  reorderUnitCost,
} from "@/features/purchases/low-stock"
import { useQueryClient } from "@tanstack/react-query"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import CreateMedicineModal from "@/features/medicines/components/create-medicine-modal"
import CreateSupplierModal from "@/features/suppliers/components/create-supplier-modal"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { CurrencyDisplay } from "@/components/currency-display"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AlertTriangle, PackagePlus, Plus, TrendingDown, Trash2 } from "lucide-react"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { useSupplierPrices } from "@/features/suppliers/hooks/use-supplier-price-list"
import { applyPriceListRates, priceListRateFor } from "@/features/purchases/lib/price-list-prefill"
import { useTranslations } from "@/lib/i18n/i18n-provider"
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
  toNumber as toAmount,
} from "@/features/purchases/components/purchase-line-terms"

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}

interface LineRow {
  id: string
  medicine_id: string
  quantity_ordered: number
  unit_cost: string
  /** Typed VAT for the line; blank = the VAT rate on the line's taxable value. */
  vat_amount: string
  /** Free (bonus) quantity, in the same unit as the quantity. */
  free_quantity: string
  discount_mode: DiscountMode
  discount_value: string
  /** Quantity, free quantity and rate are per pack of the medicine's units per pack. */
  in_packs: boolean
  /** Quantity, free quantity and rate are per box (units per pack × packs per box). */
  in_boxes: boolean
  batch_number: string
  expiry_date: string
  selling_price: string
}

const lineDefaults = {
  vat_amount: "",
  free_quantity: "",
  discount_mode: "percent" as DiscountMode,
  discount_value: "",
  in_packs: false,
  in_boxes: false,
  batch_number: "",
  expiry_date: "",
  selling_price: "",
}

interface CreatePurchaseOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  /** Pre-fills the supplier and line items — used by the reorder-suggestions panel
   *  on the Purchases page so a low-stock alert becomes a one-click PO draft that
   *  still requires a human to review quantities and submit, not an auto-sent order. */
  initialSupplierId?: string
  initialLines?: { medicine_id: string; quantity_ordered: number; unit_cost: string }[]
  /** Opened from a low-stock context (e.g. /dashboard/purchases?action=create&from=low-stock): the
   *  order starts pre-filled with every medicine at or below its reorder level, for review. */
  prefillLowStock?: boolean
}

const emptyLine = (): LineRow => ({
  id: crypto.randomUUID(),
  medicine_id: "",
  quantity_ordered: 1,
  unit_cost: "0",
  ...lineDefaults,
})

export default function CreatePurchaseOrderModal({
  isOpen,
  onClose,
  onCreated,
  initialSupplierId,
  initialLines,
  prefillLowStock = false,
}: CreatePurchaseOrderModalProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [saving, setSaving] = useState(false)
  /** One Idempotency-Key per order being created, reused when the same order is submitted again. */
  const createKeys = useRef(createIdempotencyKeyTracker())

  const [supplierId, setSupplierId] = useState("")
  const [orderDate, setOrderDate] = useState(formatLocalDateYmd(new Date()))
  const [expectedDate, setExpectedDate] = useState("")
  const [notes, setNotes] = useState("")
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [lines, setLines] = useState<LineRow[]>([])
  const [billDiscountMode, setBillDiscountMode] = useState<DiscountMode>("percent")
  const [billDiscountValue, setBillDiscountValue] = useState("")
  const [vatBill, setVatBill] = useState(true)
  const { data: vatRatePercent } = useVatRate()
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [medicineSearching, setMedicineSearching] = useState(false)
  const [createMedicineLineId, setCreateMedicineLineId] = useState<string | null>(null)
  const [createMedicineName, setCreateMedicineName] = useState("")
  const [errors, setErrors] = useState<{ supplier?: string; lines?: string }>({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [loadingLowStock, setLoadingLowStock] = useState(false)
  /** Supplier of each medicine that was added as a low-stock suggestion. */
  const [suggestedSupplierOf, setSuggestedSupplierOf] = useState<Record<string, string | null>>({})
  /** Lines whose rate the user typed: the supplier's price list never overwrites those. */
  const [rateTypedLineIds, setRateTypedLineIds] = useState<ReadonlySet<string>>(() => new Set())
  const tSuppliers = useTranslations("suppliers")

  const isDirty = lines.length > 0 || !!notes.trim() || !!supplierInvoiceNumber.trim() || !!expectedDate
  const requestClose = () => {
    if (saving) return
    if (isDirty) setConfirmDiscard(true)
    else onClose()
  }

  const resetForm = () => {
    setSupplierId(initialSupplierId || "")
    setOrderDate(formatLocalDateYmd(new Date()))
    setExpectedDate("")
    setNotes("")
    setSupplierInvoiceNumber("")
    setBillDiscountMode("percent")
    setBillDiscountValue("")
    setVatBill(true)
    setErrors({})
    setLines(
      initialLines && initialLines.length > 0
        ? initialLines.map((l) => ({ id: crypto.randomUUID(), ...lineDefaults, ...l }))
        : []
    )
  }

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    resetForm()
    setSuggestedSupplierOf({})
    setRateTypedLineIds(new Set())
    setLoadingRefs(true)
    ;(async () => {
      try {
        // One page up front (the server caps a page at 200); the medicine picker searches the server for the rest.
        const medRes = await medicinesApi.getMedicines({ limit: 200, sortBy: "name", sortOrder: "asc" })
        if (cancelled) return
        if (medRes.error) {
          toast({ title: "Failed to load medicines", description: medRes.error, variant: "destructive" })
        }
        setMedicines(medRes.data || [])
      } finally {
        if (!cancelled) setLoadingRefs(false)
      }
      if (!cancelled && prefillLowStock && !(initialLines && initialLines.length > 0)) {
        await addLowStockItems({ auto: true, supplierFilter: null, currentMedicineIds: [], isCancelled: () => cancelled })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const refreshSuppliers = () => {
    void queryClient.invalidateQueries({ queryKey: supplierOptionKeys.all() })
  }

  /**
   * Adds every medicine at or below its reorder level (only the chosen supplier's when one is set)
   * that is not on the order yet, with a suggested quantity and the last cost price. See low-stock.ts
   * for the quantity rule. The lines stay editable and removable before saving.
   */
  const addLowStockItems = async ({
    auto = false,
    supplierFilter,
    currentMedicineIds,
    isCancelled = () => false,
  }: {
    auto?: boolean
    supplierFilter: string | null
    currentMedicineIds: string[]
    isCancelled?: () => boolean
  }) => {
    setLoadingLowStock(true)
    try {
      const [{ data, error }, onOrder] = await Promise.all([
        loadLowStockMedicines(),
        loadOnOrderQuantities().catch(() => new Map<string, number>()),
      ])
      if (isCancelled()) return
      if (error) {
        toast({ title: "Could not load low-stock medicines", description: error, variant: "destructive" })
        return
      }
      const suggestions = buildLowStockLines(data, {
        supplierId: supplierFilter,
        excludeMedicineIds: currentMedicineIds,
        onOrder,
      })
      const added = suggestions.length
      const suggestedSupplier = dominantSupplierId(suggestions)
      setLines((prev) => {
        // Lines may have changed while the stock check ran: never add a medicine twice.
        const present = new Set(prev.map((l) => l.medicine_id).filter(Boolean))
        return [
          ...prev,
          ...suggestions
            .filter((sug) => !present.has(sug.medicine_id))
            .map((sug) => ({
              ...emptyLine(),
              medicine_id: sug.medicine_id,
              quantity_ordered: sug.quantity_ordered,
              unit_cost: sug.unit_cost,
            })),
        ]
      })
      // The combobox needs each medicine in its list to show the name.
      setMedicines((prev) => {
        const known = new Set(prev.map((m) => m.id))
        return [...prev, ...data.filter((m) => !known.has(m.id))]
      })
      setSuggestedSupplierOf((prev) => {
        const next = { ...prev }
        for (const m of data) next[m.id] = m.supplier_id
        return next
      })
      if (added > 0) {
        setErrors((prev) => ({ ...prev, lines: undefined }))
        if (auto && suggestedSupplier) setSupplierId((current) => current || suggestedSupplier)
      }
      toast({
        title: added > 0 ? `Added ${added} low-stock ${added === 1 ? "medicine" : "medicines"}` : "Nothing to add",
        description:
          added > 0
            ? "Quantities refill each medicine to its maximum stock (or twice its reorder level). Review before saving."
            : supplierFilter
              ? "No medicine from this supplier is at or below its reorder level, or they are already on this or an open order."
              : "No medicine is at or below its reorder level, or they are already on this or an open order.",
      })
    } finally {
      setLoadingLowStock(false)
    }
  }

  /** Low-stock lines whose medicine is normally bought from a different supplier than the one chosen. */
  const otherSupplierLineIds = useMemo(
    () =>
      supplierId
        ? lines
            .filter((l) => {
              const of = suggestedSupplierOf[l.medicine_id]
              return of !== undefined && of !== null && of !== supplierId
            })
            .map((l) => l.id)
        : [],
    [lines, supplierId, suggestedSupplierOf],
  )

  const handleMedicineSearch = async (query: string) => {
    if (!query) return
    setMedicineSearching(true)
    try {
      const res = await medicinesApi.getMedicines({ search: query, limit: 50 })
      const found = res.data || []
      setMedicines((prev) => {
        const merged = [...prev]
        for (const m of found) {
          if (!merged.some((existing) => existing.id === m.id)) merged.push(m)
        }
        return merged
      })
    } catch {
      // Live search failure just falls back to the locally filtered list.
    } finally {
      setMedicineSearching(false)
    }
  }

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()])
  }

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const updateLine = (id: string, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const openCreateMedicine = (lineId: string, searchText: string) => {
    setCreateMedicineLineId(lineId)
    setCreateMedicineName(searchText)
  }

  const handleMedicineCreated = (medicine?: { id: string; name: string }) => {
    if (!medicine) return
    setMedicines((prev) =>
      prev.some((m) => m.id === medicine.id) ? prev : [...prev, medicine as Medicine]
    )
    if (createMedicineLineId) {
      updateLine(createMedicineLineId, { medicine_id: medicine.id })
    }
    setCreateMedicineLineId(null)
    setCreateMedicineName("")
  }

  // Live bill figures — the same rules the server applies (purchase-bill-totals.ts), over the lines that will
  // be saved (a medicine and a quantity above 0), so the bill discount is spread exactly as it will be.
  const medicineById = useMemo(() => new Map(medicines.map((m) => [m.id, m])), [medicines])

  // Supplier price list: the agreed rate (as of the order date) fills each line the user hasn't typed a rate on.
  const priceLookupIds = useMemo(() => [...new Set(lines.map((l) => l.medicine_id).filter(Boolean))], [lines])
  const { data: supplierPrices } = useSupplierPrices(supplierId, priceLookupIds, orderDate, isOpen)
  useEffect(() => {
    if (!supplierPrices) return
    setLines((prev) => {
      const next = applyPriceListRates(
        prev,
        supplierPrices,
        (id) => ({ unitsPerPack: medicineById.get(id)?.units_per_pack, packsPerBox: medicineById.get(id)?.packs_per_box }),
        rateTypedLineIds,
      )
      return next === prev ? prev : [...next]
    })
  }, [supplierPrices, lines, medicineById, rateTypedLineIds])
  const markRateTyped = (lineId: string, typed: boolean) =>
    setRateTypedLineIds((prev) => {
      if (prev.has(lineId) === typed) return prev
      const next = new Set(prev)
      if (typed) next.add(lineId)
      else next.delete(lineId)
      return next
    })
  const entryOf = (l: LineRow): PurchaseLineEntry => {
    const medicine = medicineById.get(l.medicine_id)
    const unitsPerPack = medicine?.units_per_pack ?? null
    return {
      quantity: toAmount(l.quantity_ordered),
      freeQuantity: toAmount(l.free_quantity),
      rate: toAmount(l.unit_cost),
      discountMode: l.discount_mode,
      discountValue: toAmount(l.discount_value),
      inPacks: l.in_packs && (unitsPerPack ?? 0) > 1,
      unitsPerPack,
      inBoxes: l.in_boxes,
      packsPerBox: medicine?.packs_per_box ?? null,
      isTaxable: vatBill && (medicine?.is_taxable ?? true),
      vatOverride: l.vat_amount.trim() === "" ? null : toAmount(l.vat_amount),
    }
  }
  const billLines = lines.filter((l) => l.medicine_id && l.quantity_ordered > 0)
  const billEntries = billLines.map(entryOf)
  const totals = computePurchaseBill(
    billEntries,
    { discountMode: billDiscountMode, discountValue: toAmount(billDiscountValue) },
    vatRatePercent ?? 0,
  )
  const totalsById = new Map(billLines.map((l, i) => [l.id, totals.lines[i]]))

  /** First problem with the discounts, or null. The server rejects a discount above the amount it applies to. */
  const discountProblem = (): string | null => {
    for (const [i, entry] of billEntries.entries()) {
      const gross = totals.lines[i].gross
      if (entry.discountMode === "percent" ? entry.discountValue > 100 : entry.discountValue > gross) {
        return `Line ${lines.indexOf(billLines[i]) + 1}: the discount is more than the line amount.`
      }
    }
    const discounted = totals.gross - totals.lineDiscount
    const bill = toAmount(billDiscountValue)
    if (billDiscountMode === "percent" ? bill > 100 : bill > discounted + 0.0001) {
      return "The bill discount is more than the bill amount."
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) {
      setErrors({ supplier: "Choose the supplier you are ordering from." })
      document.getElementById("po-supplier")?.focus()
      return
    }
    const items = billLines.map((l, i) => {
      const terms = purchaseLineTermsBody(billEntries[i])
      return {
        medicine_id: l.medicine_id,
        quantity_ordered: l.quantity_ordered,
        unit_cost: l.unit_cost,
        // VAT on the line's value after its own and its share of the bill discount.
        vat_amount: String(totals.lines[i].vat),
        batch_number: l.batch_number,
        expiry_date: l.expiry_date,
        selling_price: l.selling_price,
        free_quantity: terms.freeQuantity,
        discount_percent: terms.discountPercent,
        discount_amount: terms.discountAmount,
        in_packs: terms.inPacks,
        in_boxes: terms.inBoxes,
      }
    })
    if (items.length === 0) {
      setErrors({ lines: "Add at least one medicine with a quantity above 0." })
      document.getElementById("po-lines-heading")?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }
    const problem = discountProblem()
    if (problem) {
      setErrors({ lines: problem })
      document.getElementById("po-lines-heading")?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }
    setErrors({})

    setSaving(true)
    try {
      const order = {
        supplier_id: supplierId,
        order_date: orderDate,
        expected_delivery_date: expectedDate || undefined,
        notes: notes || undefined,
        supplier_invoice_number: supplierInvoiceNumber || undefined,
        items,
        ...(() => {
          const bill = billDiscountBody({ discountMode: billDiscountMode, discountValue: toAmount(billDiscountValue) })
          return { bill_discount_percent: bill.billDiscountPercent, bill_discount_amount: bill.billDiscountAmount }
        })(),
      }
      // Same order retried (e.g. after a timeout) = same key, so it is created once.
      const { error } = await purchasesApi.createPurchaseOrder(order, createKeys.current.keyFor(JSON.stringify(order)))
      if (error) throw new Error(error)
      createKeys.current.reset()
      toast({ title: "Purchase order created" })
      onCreated()
      onClose()
    } catch (err) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && requestClose()}>
        <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
          </DialogHeader>
          <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="sr-only">Order details</CardTitle>
              <CardDescription>
                Choose the supplier and dates, then add the medicines you are ordering. Fields marked{" "}
                <RequiredMark /> are required.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {loadingRefs ? (
                <div className="space-y-4" aria-busy aria-label="Loading suppliers and medicines">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-9 w-full" />
                      </div>
                    ))}
                  </div>
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <fieldset className="space-y-4">
                    <legend className="mb-3 text-sm font-semibold text-foreground">Order details</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="po-supplier">
                          Supplier <RequiredMark />
                        </Label>
                        <div className="flex gap-2">
                          <SupplierSelect
                            id="po-supplier"
                            value={supplierId}
                            onValueChange={(v) => {
                              setSupplierId(v)
                              setErrors((prev) => ({ ...prev, supplier: undefined }))
                            }}
                            placeholder="Choose supplier"
                            className="flex-1"
                            aria-required
                            aria-invalid={!!errors.supplier}
                            aria-describedby={errors.supplier ? "po-supplier-error" : undefined}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setSupplierModalOpen(true)}
                            aria-label="Add new supplier"
                            title="Add new supplier"
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                        {errors.supplier && (
                          <p id="po-supplier-error" role="alert" className="text-xs text-destructive">
                            {errors.supplier}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="order_date">
                          Order date <RequiredMark />
                        </Label>
                        <DatePicker id="order_date" value={orderDate} onChange={setOrderDate} aria-required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expected">Expected delivery</Label>
                        <DatePicker
                          id="expected"
                          value={expectedDate}
                          onChange={setExpectedDate}
                          min={orderDate || undefined}
                          allowFuture
                          clearable
                          aria-describedby="expected-help"
                        />
                        <p id="expected-help" className="text-xs text-muted-foreground">Optional.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supplier_invoice_number">Supplier invoice no.</Label>
                        <Input
                          id="supplier_invoice_number"
                          value={supplierInvoiceNumber}
                          onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                          maxLength={64}
                          placeholder="As printed on the supplier invoice"
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional. The supplier&apos;s tax invoice / bill number, used for VAT records.
                        </p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input
                          id="notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  </fieldset>

                  <section className="space-y-3" aria-labelledby="po-lines-heading">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id="po-lines-heading" className="text-sm font-semibold text-foreground">
                        Line items <RequiredMark />
                        {lines.length > 0 && (
                          <span className="num ml-2 font-normal text-muted-foreground">
                            {lines.length} {lines.length === 1 ? "line" : "lines"}
                          </span>
                        )}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void addLowStockItems({
                              supplierFilter: supplierId || null,
                              currentMedicineIds: lines.map((l) => l.medicine_id).filter(Boolean),
                            })
                          }
                          loading={loadingLowStock}
                          loadingText="Checking stock…"
                          title={
                            supplierId
                              ? "Add this supplier's medicines that are at or below their reorder level"
                              : "Add every medicine that is at or below its reorder level"
                          }
                        >
                          <TrendingDown aria-hidden />
                          Add low-stock items
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            addLine()
                            setErrors((prev) => ({ ...prev, lines: undefined }))
                          }}
                        >
                          <Plus aria-hidden />
                          Add medicine
                        </Button>
                      </div>
                    </div>
                    {otherSupplierLineIds.length > 0 && (
                      <div
                        role="status"
                        className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex items-start gap-1.5">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                          <span>
                            <span className="num">{otherSupplierLineIds.length}</span>{" "}
                            {otherSupplierLineIds.length === 1 ? "suggested medicine is" : "suggested medicines are"} usually
                            bought from another supplier.
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => setLines((prev) => prev.filter((l) => !otherSupplierLineIds.includes(l.id)))}
                        >
                          Keep only this supplier&apos;s items
                        </Button>
                      </div>
                    )}
                    {errors.lines && (
                      <p role="alert" className="text-xs text-destructive">
                        {errors.lines}
                      </p>
                    )}
                    {lines.length === 0 ? (
                      <div className="rounded-md border border-dashed">
                        <EmptyState
                          size="compact"
                          icon={PackagePlus}
                          title="No medicines on this order yet"
                          description="Add each medicine you want from this supplier with its quantity and unit cost, or start from the medicines that are running low."
                          action={{ label: "Add medicine", icon: Plus, onClick: addLine }}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[14rem]">
                                  Medicine <RequiredMark />
                                </TableHead>
                                <TableHead className="w-24 text-right">
                                  Qty <RequiredMark />
                                </TableHead>
                                <TableHead className="w-24" title="Enter in units, or in packs for a medicine with a pack size">
                                  Unit
                                </TableHead>
                                <TableHead className="w-20 text-right" title="Free (bonus) quantity, e.g. the 1 of a 10+1 scheme">
                                  Free
                                </TableHead>
                                <TableHead className="w-32 text-right">
                                  Rate <RequiredMark />
                                </TableHead>
                                <TableHead className="w-32" title="Trade discount on this line, as a percent or an amount">
                                  Disc.
                                </TableHead>
                                <TableHead className="w-28 text-right" title="VAT on the line's value after discounts; blank = the VAT rate">
                                  VAT
                                </TableHead>
                                <TableHead className="w-32 text-right" title="Taxable value after the line and bill discounts">
                                  Amount
                                </TableHead>
                                <TableHead className="w-28 text-right" title="Cost of each unit put into stock, free ones included">
                                  Cost/unit
                                </TableHead>
                                <TableHead className="w-32" title="Optional now — required when the goods are received">
                                  Batch no.
                                </TableHead>
                                <TableHead className="w-40" title="Optional now — required when the goods are received">
                                  Expiry
                                </TableHead>
                                <TableHead className="w-32 text-right" title="Optional now — required when the goods are received">
                                  Selling price
                                </TableHead>
                                <TableHead className="w-12">
                                  <span className="sr-only">Remove</span>
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lines.map((line, index) => {
                                const lineTotals = totalsById.get(line.id)
                                const medicine = medicineById.get(line.medicine_id)
                                const n = index + 1
                                return (
                                  <TableRow key={line.id}>
                                    <TableCell>
                                      <MedicineCombobox
                                        medicines={medicines}
                                        value={line.medicine_id}
                                        onValueChange={(v) => {
                                          // A new medicine takes its price-list rate again.
                                          if (v !== line.medicine_id) markRateTyped(line.id, false)
                                          // Without a supplier price list the rate starts at the latest purchase
                                          // cost (scaled to the line's unit) instead of 0; a price list still wins.
                                          const picked = medicineById.get(v)
                                          const baseCost = picked ? Number(reorderUnitCost(picked)) || 0 : 0
                                          const unitsPerPack = picked?.units_per_pack ?? 1
                                          const perUnit = line.in_boxes
                                            ? unitsPerPack * (picked?.packs_per_box ?? 1)
                                            : line.in_packs
                                              ? unitsPerPack
                                              : 1
                                          updateLine(line.id, {
                                            medicine_id: v,
                                            ...(v !== line.medicine_id && baseCost > 0
                                              ? { unit_cost: (baseCost * perUnit).toFixed(2) }
                                              : {}),
                                          })
                                        }}
                                        placeholder="Search medicine..."
                                        onSearchChange={handleMedicineSearch}
                                        isSearching={medicineSearching}
                                        onCreateNew={(searchText) => openCreateMedicine(line.id, searchText)}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={line.quantity_ordered}
                                        aria-label={`Quantity, line ${n}`}
                                        className="num min-w-[5.5rem] text-right"
                                        onChange={(e) =>
                                          updateLine(line.id, {
                                            quantity_ordered: Number.parseInt(e.target.value, 10) || 0,
                                          })
                                        }
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
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0"
                                        value={line.free_quantity}
                                        aria-label={`Free quantity, line ${n}`}
                                        className="num min-w-[4.5rem] text-right"
                                        onChange={(e) => updateLine(line.id, { free_quantity: e.target.value })}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={line.unit_cost}
                                        aria-label={`${line.in_boxes ? "Rate per box" : line.in_packs ? "Rate per pack" : "Unit cost"}, line ${n}`}
                                        className="num min-w-[6.5rem] text-right"
                                        onChange={(e) => {
                                          markRateTyped(line.id, true)
                                          updateLine(line.id, { unit_cost: e.target.value })
                                        }}
                                      />
                                      {(() => {
                                        const price = supplierPrices?.get(line.medicine_id)
                                        const rate = priceListRateFor(
                                          line,
                                          supplierPrices,
                                          { unitsPerPack: medicine?.units_per_pack, packsPerBox: medicine?.packs_per_box },
                                          rateTypedLineIds,
                                        )
                                        return price && rate === line.unit_cost ? (
                                          <p
                                            className="mt-1 text-right text-[11px] leading-none text-primary"
                                            title={tSuppliers("priceList.poHintTitle", { amount: String(price.unit_cost) })}
                                          >
                                            {tSuppliers("priceList.poHint")}
                                          </p>
                                        ) : null
                                      })()}
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
                                        type="text"
                                        inputMode="decimal"
                                        placeholder={lineTotals ? String(lineTotals.vat) : "0"}
                                        value={line.vat_amount}
                                        disabled={!vatBill || medicine?.is_taxable === false}
                                        aria-label={`VAT amount, line ${n}`}
                                        className="num min-w-[4.5rem] text-right"
                                        onChange={(e) => updateLine(line.id, { vat_amount: e.target.value })}
                                      />
                                    </TableCell>
                                    <TableCell className="num whitespace-nowrap text-right font-medium">
                                      <CurrencyDisplay amount={lineTotals?.taxable ?? 0} />
                                    </TableCell>
                                    <TableCell className="num whitespace-nowrap text-right text-muted-foreground">
                                      {lineTotals ? <CurrencyDisplay amount={lineTotals.effectiveUnitCost} /> : "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        maxLength={64}
                                        placeholder="Optional"
                                        value={line.batch_number}
                                        className="min-w-[7.5rem]"
                                        aria-label={`Batch number, line ${n} (optional)`}
                                        onChange={(e) => updateLine(line.id, { batch_number: e.target.value })}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <DatePicker
                                        value={line.expiry_date}
                                        aria-label={`Expiry date, line ${n} (optional)`}
                                        onChange={(v) => updateLine(line.id, { expiry_date: v })}
                                        presets={EXPIRY_PRESETS}
                                        allowFuture
                                        placeholder="Expiry"
                                        compact
                                        clearable
                                        className="min-w-36"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="Optional"
                                        value={line.selling_price}
                                        aria-label={`Selling price, line ${n} (optional)`}
                                        className="num min-w-[6.5rem] text-right"
                                        onChange={(e) => updateLine(line.id, { selling_price: e.target.value })}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => removeLine(line.id)}
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
                        <p className="text-xs text-muted-foreground">
                          Batch no., expiry and selling price can be left blank now — they are required when the goods
                          are received.
                        </p>

                        <PurchaseBillTotalsPanel
                          idPrefix="po"
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
                      </>
                    )}
                  </section>

                  <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                      Cancel
                    </Button>
                    <Button type="submit" loading={saving} loadingText="Saving…">
                      Create draft PO
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
        title="Discard this purchase order?"
        description="The lines and details you entered will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="destructive"
      />

      <CreateSupplierModal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        onCreate={refreshSuppliers}
      />

      <CreateMedicineModal
        isOpen={createMedicineLineId !== null}
        onClose={() => setCreateMedicineLineId(null)}
        onCreate={handleMedicineCreated}
        initialSupplierId={supplierId || undefined}
        initialName={createMedicineName}
      />
    </>
  )
}
