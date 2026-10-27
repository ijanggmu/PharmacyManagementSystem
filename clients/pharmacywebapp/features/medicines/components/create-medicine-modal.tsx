"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { BillPaymentFields } from "@/features/medicines/components/bill-payment-fields"
import { emptyBillPayment, toBillPaymentInput, validateBillPayment, type BillPaymentState } from "@/features/medicines/lib/bill-payment"
import { StockFundingFields } from "@/features/medicines/components/stock-funding-fields"
import { stockFundingForRequest, validateStockFunding, type StockFundingChoice } from "@/features/medicines/lib/stock-funding"
import { effectivePurchaseVat, formatRate, suggestedPurchaseVat } from "@/features/medicines/lib/purchase-vat"
import { VatRateNotice } from "@/features/medicines/components/vat-rate-notice"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, Boxes, Check, ChevronsUpDown, Package, Pill, Plus, ShieldCheck, Truck, Wallet } from "lucide-react"
import { FieldHint, MedicineFormSection, RequiredMark } from "./medicine-form-section"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { CurrencyDisplay } from "@/components/currency-display"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { validateMedicineForm, type MedicineFormErrors } from "@/lib/utils/medicine-form-validation"
import { FieldError } from "@/components/ui/field-error"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { supplierNameSchema } from "@/lib/utils/validation"
import ConfirmNewSupplierDialog from "@/features/suppliers/components/confirm-new-supplier-dialog"
import { nepalMedicineCatalogApi, NepalMedicineCatalogItem } from "@/features/medicines/api-client-nepal-catalog"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { suppliersApi } from "@/features/suppliers/api-client"
import { medicinesApi, type DuplicateMedicine } from "@/features/medicines/api-client"
import { BarcodeField } from "@/features/medicines/components/barcode-field"
import { DuplicateMedicineDialog } from "@/features/medicines/components/duplicate-medicine-dialog"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { boxSummary } from "@/features/medicines/lib/box-unit"
import { PriceCurrencyToggle, PriceEntryControls } from "@/features/medicines/components/price-entry-controls"
import {
  DEFAULT_PRICE_ENTRY,
  formUnits,
  priceBasisLabel,
  priceFieldSuffix,
  priceIsConverted,
  toBaseUnitPrice,
  type PriceEntry,
} from "@/features/medicines/lib/price-entry"
import { StockReceiptSummaryDialog } from "@/features/medicines/components/stock-receipt-summary-dialog"
import { stockFundingNote, supplierPaymentNote, type ReceivedStockBill } from "@/features/medicines/lib/stock-receipt-summary"
import { formatReceiptQuantity } from "@/features/purchases/lib/receipt-units"
import { nepalYmdOf } from "@/lib/utils/nepal-time"

interface CreateMedicineModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (medicine?: { id: string; name: string }) => void
  initialSupplierId?: string
  initialName?: string
  /** Just the medicine card, no stock: opened from a delivery screen (purchase receipt, consignment) that brings
   *  the stock in itself. Hides the stock and supplier sections. */
  cardOnly?: boolean
}

export default function CreateMedicineModal({
  isOpen,
  onClose,
  onCreate,
  initialSupplierId,
  initialName,
  cardOnly = false,
}: CreateMedicineModalProps) {
  const emptyFormData = {
    name: "",
    generic_name: "",
    brand_name: "",
    description: "",
    dosage: "",
    form: "",
    strength: "",
    unit_price: "",
    cost_price: "",
    stock_quantity: "",
    minimum_stock: "10",
    maximum_stock: "100",
    expiry_date: "",
    batch_number: "",
    barcode: "",
    category_id: "",
    supplier_id: "",
    supplier_invoice_number: "",
    vat_amount: "",
    prescription_required: false,
    controlled_substance: false,
    // Most medicines are VAT-exempt in Nepal; turn it on for the taxable ones.
    is_taxable: false,
    side_effects: "",
    storage_instructions: "",
    requires_cold_chain: false,
    storage_temp_min_c: "",
    storage_temp_max_c: "",
    units_per_pack: "",
    unit_label: "",
    packs_per_box: "",
    box_label: "",
  }
  const [formData, setFormData] = useState(emptyFormData)
  /** Paid now / on credit for the opening-stock supplier bill. */
  const [payment, setPayment] = useState<BillPaymentState>(emptyBillPayment)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  /** How opening stock without a supplier was paid for; "" until chosen (required). */
  const [funding, setFunding] = useState<StockFundingChoice>("")
  const [fundingError, setFundingError] = useState<string | null>(null)
  // The VAT box follows the Settings rate until the user types their own figure from the bill.
  const [vatEdited, setVatEdited] = useState(false)
  const { data: vatRatePercent, isLoading: vatRateLoading } = useVatRate()
  const [similarNames, setSimilarNames] = useState<{ id: string; name: string; strength: string | null; form: string | null }[]>([])
  const [fieldErrors, setFieldErrors] = useState<MedicineFormErrors>({})
  /** Existing medicines with the same name + strength + form; non-empty opens the duplicate dialog. */
  const [duplicates, setDuplicates] = useState<DuplicateMedicine[]>([])
  const [duplicateBusy, setDuplicateBusy] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  /** How the cost and selling price are typed (per strip, in INR, ...); saved per unit in NPR. */
  const [priceEntry, setPriceEntry] = useState<PriceEntry>(DEFAULT_PRICE_ENTRY)
  /** The stock just received, shown as receipt details once the form closes. */
  const [receipt, setReceipt] = useState<ReceivedStockBill[] | null>(null)
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newSupplierName, setNewSupplierName] = useState("")
  const [supplierPendingConfirm, setSupplierPendingConfirm] = useState<string | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  /** Name just filled from a directory pick, so the search effect does not reopen that same suggestion. */
  const catalogSelectionRef = useRef<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogItems, setCatalogItems] = useState<NepalMedicineCatalogItem[]>([])
  const { toast } = useToast()
  const { currentCurrency } = useCurrency()
  const queryClient = useQueryClient()

  useEffect(() => {
    const fetchData = async () => {
      const [categoriesResult, suppliersResult] = await Promise.all([
        categoriesApi.getCategories(),
        suppliersApi.getSupplierOptions(),
      ])

      if (!categoriesResult.error) setCategories(categoriesResult.data)
      if (!suppliersResult.error) setSuppliers(suppliersResult.data)
    }

    if (isOpen) {
      fetchData()
      // Pre-fill supplier/name if provided
      setFormData((prev) => ({
        ...prev,
        supplier_id: cardOnly ? "" : initialSupplierId || prev.supplier_id,
        name: initialName || prev.name,
        stock_quantity: cardOnly ? "0" : prev.stock_quantity,
      }))
    } else {
      // Reset form when modal closes
      catalogSelectionRef.current = null
      setCatalogOpen(false)
      setCatalogItems([])
      setFormData({ ...emptyFormData, supplier_id: initialSupplierId || "" })
      setVatEdited(false)
      setFieldErrors({})
      setPayment(emptyBillPayment())
      setPaymentError(null)
      setFunding("")
      setFundingError(null)
      setPriceEntry(DEFAULT_PRICE_ENTRY)
    }
  }, [isOpen, initialSupplierId, initialName, cardOnly])

  useEffect(() => {
    const keyword = formData.name.trim()
    if (!isOpen || keyword.length < 2 || catalogSelectionRef.current === keyword) {
      return
    }

    let cancelled = false
    const timeout = setTimeout(async () => {
      try {
        setCatalogLoading(true)
        const data = await nepalMedicineCatalogApi.search(keyword, 12)
        if (cancelled) return
        setCatalogItems(data)
        setCatalogOpen(true)
      } catch {
        if (!cancelled) setCatalogItems([])
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [formData.name, isOpen])

  // LASA (look-alike-sound-alike) check — warns, doesn't block, on names close enough
  // to an existing medicine to risk confusion at the counter.
  useEffect(() => {
    const keyword = formData.name.trim()
    if (!isOpen || keyword.length < 3) {
      setSimilarNames([])
      return
    }
    const timeout = setTimeout(async () => {
      const matches = await medicinesApi.findSimilarNames(keyword)
      setSimilarNames(matches)
    }, 400)
    return () => clearTimeout(timeout)
  }, [formData.name, isOpen])

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    try {
      const { data, error } = await categoriesApi.createCategory(newCategoryName.trim())
      if (error || !data) throw new Error(error ?? "Failed to create category")

      setCategories([...categories, data])
      setFormData({ ...formData, category_id: data.id })
      setNewCategoryName("")
      setShowCreateCategory(false)
      setCategoryOpen(false)

      toast({
        title: "Success",
        description: "Category created successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create category",
        variant: "destructive",
      })
    }
  }

  const askCreateSupplier = () => {
    const parsed = supplierNameSchema.safeParse(newSupplierName.trim())
    if (!parsed.success) {
      toast({
        title: "Invalid supplier name",
        description: parsed.error.issues[0]?.message || "Supplier name is required",
        variant: "destructive",
      })
      return
    }
    setSupplierPendingConfirm(parsed.data)
  }

  const handleCreateSupplier = async () => {
    const name = supplierPendingConfirm
    if (!name) return

    try {
      const { data, error } = await suppliersApi.createSupplier({
        name,
        contact_person: undefined,
        email: undefined,
        phone: undefined,
        address: undefined,
      })
      if (error || !data) throw new Error(error ?? "Failed to create supplier")

      setSuppliers([...suppliers, data])
      setFormData({ ...formData, supplier_id: data.id })
      setNewSupplierName("")
      setSupplierPendingConfirm(null)
      setShowCreateSupplier(false)
      setSupplierOpen(false)

      toast({
        title: "Success",
        description: "Supplier created successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create supplier",
        variant: "destructive",
      })
    }
  }

  // The opening stock makes a supplier bill only with a supplier and a positive quantity.
  const openingQty = Number.parseInt(formData.stock_quantity) || 0
  const hasSupplierBill = !!formData.supplier_id && openingQty > 0
  // Opening stock without a supplier has no bill, so the user says how it was paid for.
  const hasNoSupplierStock = !formData.supplier_id && openingQty > 0
  // Prices as typed (per strip, in INR, ...) and as saved: per unit, in NPR.
  const priceUnits = formUnits(formData)
  const sellingPerUnit = toBaseUnitPrice(formData.unit_price, priceEntry, priceUnits, "selling")
  const costPerUnit = toBaseUnitPrice(formData.cost_price, priceEntry, priceUnits, "cost")
  const costConverted = priceIsConverted(priceEntry, priceUnits, "cost")
  const sellingConverted = priceIsConverted(priceEntry, priceUnits, "selling")
  // INR entry only makes sense for a pharmacy that keeps its books in NPR.
  const allowInr = currentCurrency.code === "NPR"
  const baseUnitName = priceBasisLabel("base", priceUnits)
  const costSuffix = priceFieldSuffix(priceEntry, priceUnits, "cost")
  const sellingSuffix = priceFieldSuffix(priceEntry, priceUnits, "selling")
  const openingCost = costPerUnit ?? 0
  const suggestedVat = suggestedPurchaseVat(openingQty, openingCost, vatRatePercent ?? 0, formData.is_taxable)
  const enteredVat = vatEdited && formData.vat_amount !== "" ? Number.parseFloat(formData.vat_amount) : null
  const receiptVat = effectivePurchaseVat(openingQty, openingCost, vatRatePercent ?? 0, formData.is_taxable, enteredVat)
  const vatFieldValue = !formData.is_taxable ? "0" : vatEdited ? formData.vat_amount : suggestedVat > 0 ? String(suggestedVat) : ""
  const openingBillTotal = Math.round((openingQty * openingCost + receiptVat) * 100) / 100

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateMedicineForm(formData)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.getElementById(Object.keys(errors)[0])
      firstError?.focus()
      return
    }
    const payError = hasSupplierBill ? validateBillPayment(payment, openingBillTotal) : null
    setPaymentError(payError)
    if (payError) {
      document.getElementById("create-medicine-pay-amount")?.focus()
      return
    }
    const fundError = validateStockFunding(funding, hasNoSupplierStock)
    setFundingError(fundError)
    if (fundError) {
      document.getElementById("create-medicine-funding-opening_stock")?.focus()
      return
    }
    setIsLoading(true)
    try {
      // Same name + strength + form is the same product: offer to add the stock to it instead.
      const matches = await medicinesApi.findDuplicates(formData.name, formData.strength || null, formData.form || null)
      if (matches.length > 0) {
        setDuplicates(matches)
        return
      }
      await createMedicine(false)
    } finally {
      setIsLoading(false)
    }
  }

  const buildInsertData = () => {
    const insertData: Parameters<typeof medicinesApi.createMedicine>[0] = {
      ...formData,
      // Optional: most people only know the strength, so it stands in for the dosage when that is left blank.
      dosage: formData.dosage.trim() || formData.strength.trim(),
      // API validates unit_price/cost_price as numbers, not strings
      // Always per base unit in NPR, whatever unit and currency the bill quoted.
      unit_price: (sellingPerUnit ?? Number.NaN) as any,
      cost_price: (costPerUnit ?? Number.NaN) as any,
      stock_quantity: Number.parseInt(formData.stock_quantity),
      minimum_stock: Number.parseInt(formData.minimum_stock),
      maximum_stock: Number.parseInt(formData.maximum_stock),
      brand_name: formData.brand_name || null,
      description: formData.description || null,
      category_id: formData.category_id || null,
      supplier_id: formData.supplier_id || null,
      side_effects: formData.side_effects || null,
      storage_instructions: formData.storage_instructions || null,
      barcode: formData.barcode || null,
      supplier_invoice_number: formData.supplier_invoice_number || null,
      // Input VAT exists only on a supplier bill: the bill's figure if typed, else the Settings rate on
      // taxable stock; never on exempt stock or supplier-less opening stock.
      vat_amount: hasSupplierBill ? receiptVat : null,
      requires_cold_chain: formData.requires_cold_chain,
      storage_temp_min_c: formData.storage_temp_min_c ? Number.parseFloat(formData.storage_temp_min_c) : null,
      storage_temp_max_c: formData.storage_temp_max_c ? Number.parseFloat(formData.storage_temp_max_c) : null,
      units_per_pack: formData.units_per_pack ? Number.parseInt(formData.units_per_pack) : null,
      unit_label: formData.unit_label || null,
      // A box only on top of a pack size.
      packs_per_box: formData.units_per_pack && formData.packs_per_box ? Number.parseInt(formData.packs_per_box) : null,
      box_label: formData.units_per_pack && formData.packs_per_box ? formData.box_label || null : null,
      payment: hasSupplierBill ? toBillPaymentInput(payment) : null,
      stock_funding: hasNoSupplierStock ? stockFundingForRequest(funding, false) : null,
    }
    return insertData
  }

  /** Shared tail of every successful save: refresh lists, reset the form, hand the medicine back. */
  const finishSave = (
    medicine: { id: string; name: string },
    description: string,
    supplierId: string | null,
    addedToExisting = false,
  ) => {
    // Receipt details for the stock just received (none for a card saved without stock).
    if (!cardOnly && openingQty > 0) {
      setReceipt([
        {
          supplierName: supplierId ? suppliers.find((sup) => sup.id === supplierId)?.name ?? "Supplier" : null,
          invoiceNumber: supplierId ? formData.supplier_invoice_number.trim() || null : null,
          receiptDate: nepalYmdOf(),
          paymentNote: supplierId ? supplierPaymentNote(payment) : stockFundingNote(funding),
          lines: [
            {
              medicineName: medicine.name,
              batchNumber: formData.batch_number.trim() || null,
              expiryDate: formData.expiry_date || null,
              quantity: openingQty,
              unitCost: openingCost,
              sellingPrice: sellingPerUnit ?? 0,
              vat: hasSupplierBill ? receiptVat : 0,
              addedToExisting,
            },
          ],
        },
      ])
    }
    queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
    queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
    // Stock + a supplier posts a payable on the supplier ledger — refresh
    // supplier balances too, or the Suppliers page shows a stale amount.
    if (supplierId) {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(supplierId) })
    }

    toast({ title: "Success", description })

    setFormData(emptyFormData)
    setVatEdited(false)
    setFieldErrors({})
    setPayment(emptyBillPayment())
    setPaymentError(null)
    setFunding("")
    setFundingError(null)
    setPriceEntry(DEFAULT_PRICE_ENTRY)
    setDuplicates([])

    // Trigger data refresh events for other components
    window.dispatchEvent(new CustomEvent("refresh-medicines"))
    window.dispatchEvent(new CustomEvent("refresh-data"))

    onCreate(medicine)
    onClose()
  }

  /** One Idempotency-Key per save (create, or add stock to an existing medicine), reused when retried. */
  const saveKeys = useRef(createIdempotencyKeyTracker())

  const createMedicine = async (allowDuplicate: boolean) => {
    try {
      const insertData = { ...buildInsertData(), allow_duplicate: allowDuplicate }
      const { data, error } = await medicinesApi.createMedicine(insertData, saveKeys.current.keyFor(JSON.stringify(["create", insertData])))
      if (error || !data) throw new Error(error ?? "Failed to create medicine")
      saveKeys.current.reset()
      finishSave({ id: data.id, name: data.name }, "Medicine created successfully", insertData.supplier_id ?? null)
    } catch (error: any) {
      console.error("Error creating medicine:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to create medicine",
        variant: "destructive",
      })
    }
  }

  const handleAddToExisting = async (existing: DuplicateMedicine) => {
    setDuplicateBusy(true)
    try {
      const stock = buildInsertData()
      const { error } = await medicinesApi.addStockToExisting(
        existing.id,
        stock,
        saveKeys.current.keyFor(JSON.stringify(["add-stock", existing.id, stock])),
      )
      if (error) throw new Error(error)
      saveKeys.current.reset()
      finishSave(
        { id: existing.id, name: existing.name },
        `Added ${stock.stock_quantity} to ${existing.name} as a new batch`,
        stock.supplier_id ?? null,
        true,
      )
    } catch (error: any) {
      toast({ title: "Couldn't add the stock", description: error?.message, variant: "destructive" })
    } finally {
      setDuplicateBusy(false)
    }
  }

  const handleCreateAnyway = async () => {
    setDuplicateBusy(true)
    try {
      await createMedicine(true)
    } finally {
      setDuplicateBusy(false)
    }
  }

  const applyCatalogSuggestion = async (item: NepalMedicineCatalogItem) => {
    const name = item.brand_name || formData.name
    catalogSelectionRef.current = name.trim()
    setCatalogItems([])
    setCatalogOpen(false)
    // The directory's prices are per unit in NPR.
    setPriceEntry(DEFAULT_PRICE_ENTRY)
    setFormData((prev) => ({
      ...prev,
      name,
      generic_name: item.generic_name || prev.generic_name,
      brand_name: item.brand_name || prev.brand_name,
      form: item.form || prev.form,
      strength: item.strength || prev.strength,
      dosage: item.dosage || prev.dosage,
      unit_price: item.unit_price != null ? String(item.unit_price) : prev.unit_price,
      cost_price: item.cost_price != null ? String(item.cost_price) : prev.cost_price,
      description: item.description || prev.description,
      side_effects: item.side_effects || prev.side_effects,
      storage_instructions: item.storage_instructions || prev.storage_instructions,
      prescription_required: item.prescription_required ?? prev.prescription_required,
    }))

    // Resolve the catalog's suggested category to this tenant's category list,
    // creating it on the fly if it doesn't exist yet, so category prefills too.
    if (item.category_name) {
      const existing = categories.find(
        (category) => category.name.toLowerCase() === item.category_name!.toLowerCase()
      )
      if (existing) {
        setFormData((prev) => ({ ...prev, category_id: existing.id }))
      } else {
        const { data } = await categoriesApi.createCategory(item.category_name)
        if (data) {
          setCategories((prev) => [...prev, data])
          setFormData((prev) => ({ ...prev, category_id: data.id }))
        }
      }
    }
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>{cardOnly ? "New medicine" : "Add medicine"}</DialogTitle>
          <DialogDescription>
            {cardOnly
              ? "Add the medicine to your list. Its stock comes in on the delivery you are entering."
              : "Create the medicine and receive its opening stock as the first batch."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Fields marked <span className="text-destructive">*</span> are required.
          </p>

          <MedicineFormSection title="Identity" icon={Pill} description="How the medicine is named, found and scanned at the counter.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Medicine name<RequiredMark /></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  catalogSelectionRef.current = null
                  setFormData({ ...formData, name: e.target.value })
                  if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined })
                }}
                aria-invalid={!!fieldErrors.name}
                required
              />
              <FieldError message={fieldErrors.name} />
              {catalogOpen && (catalogLoading || catalogItems.length > 0) && (
                <div className="mt-2 rounded-md border bg-popover">
                  <Command>
                    <CommandList>
                      <CommandEmpty>
                        {catalogLoading ? "Loading..." : "No catalog matches found"}
                      </CommandEmpty>
                      <CommandGroup heading="Available in Nepal">
                        {catalogItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.brand_name} ${item.generic_name}`}
                            onSelect={() => applyCatalogSuggestion(item)}
                          >
                            <div className="flex flex-col">
                              <span>{item.brand_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {item.generic_name}
                                {item.strength ? ` • ${item.strength}` : ""}
                                {item.form ? ` • ${item.form}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
              )}
              {similarNames.length > 0 && (
                <p className="mt-1.5 text-xs text-warning flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Similar existing name{similarNames.length > 1 ? "s" : ""}:{" "}
                    {similarNames.map((m) => `${m.name}${m.strength ? ` (${m.strength})` : ""}`).join(", ")} —
                    double-check this isn't a look-alike/sound-alike mix-up.
                  </span>
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="generic_name">Generic name<RequiredMark /></Label>
              <Input
                id="generic_name"
                value={formData.generic_name}
                onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="form">Form<RequiredMark /></Label>
              <Select
                value={formData.form}
                onValueChange={(value) => {
                  setFormData({ ...formData, form: value })
                  if (fieldErrors.form) setFieldErrors({ ...fieldErrors, form: undefined })
                }}
              >
                <SelectTrigger id="form" aria-invalid={!!fieldErrors.form}>
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="capsule">Capsule</SelectItem>
                  <SelectItem value="syrup">Syrup</SelectItem>
                  <SelectItem value="injection">Injection</SelectItem>
                  <SelectItem value="cream">Cream</SelectItem>
                  <SelectItem value="drops">Drops</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.form} />
            </div>
            <div>
              <Label htmlFor="strength">Strength</Label>
              <Input
                id="strength"
                value={formData.strength}
                onChange={(e) => {
                  setFormData({ ...formData, strength: e.target.value })
                  if (fieldErrors.strength) setFieldErrors({ ...fieldErrors, strength: undefined })
                }}
                aria-invalid={!!fieldErrors.strength}
                placeholder="e.g., 500mg, 10mg/ml"
              />
              <FieldError message={fieldErrors.strength} />
            </div>
            <div>
              <Label htmlFor="brand_name">Brand / company</Label>
              <Input
                id="brand_name"
                value={formData.brand_name}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category_id">Category</Label>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between"
                  >
                    {formData.category_id
                      ? categories.find((category) => category.id === formData.category_id)?.name
                      : "Select category..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 text-center text-sm">
                          <p className="mb-2">No category found.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowCreateCategory(true)
                            }}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create new category
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setFormData({ ...formData, category_id: "" })
                            setCategoryOpen(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", formData.category_id === "" ? "opacity-100" : "opacity-0")} />
                          None
                        </CommandItem>
                        {categories.map((category) => (
                          <CommandItem
                            key={category.id}
                            value={category.name}
                            onSelect={() => {
                              setFormData({ ...formData, category_id: category.id })
                              setCategoryOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", formData.category_id === category.id ? "opacity-100" : "opacity-0")} />
                            {category.name}
                          </CommandItem>
                        ))}
                        <CommandItem
                          value="__create_category__"
                          onSelect={() => {
                            setShowCreateCategory(true)
                          }}
                          className="border-t"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create new category
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          <BarcodeField
            value={formData.barcode}
            onChange={(barcode) => setFormData((prev) => ({ ...prev, barcode }))}
            medicineName={formData.name}
            strength={formData.strength}
            price={sellingPerUnit ?? ""}
          />
          </div>
          </MedicineFormSection>

          <MedicineFormSection
            title="Packaging"
            icon={Package}
            description="How it comes from the supplier. Stock is always counted in single units; strips and boxes are for entry and sale."
          >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="units_per_pack">Units per strip</Label>
              <Input
                id="units_per_pack"
                type="number"
                min={1}
                value={formData.units_per_pack}
                onChange={(e) => setFormData({ ...formData, units_per_pack: e.target.value })}
                placeholder="e.g., 10"
              />
            </div>
            <div>
              <Label htmlFor="unit_label">Pack name</Label>
              <Input
                id="unit_label"
                value={formData.unit_label}
                onChange={(e) => setFormData({ ...formData, unit_label: e.target.value })}
                placeholder="Strip"
              />
            </div>
            <div>
              <Label htmlFor="packs_per_box">Strips per box</Label>
              <Input
                id="packs_per_box"
                type="number"
                min={2}
                value={formData.packs_per_box}
                onChange={(e) => {
                  setFormData({ ...formData, packs_per_box: e.target.value })
                  if (fieldErrors.packs_per_box) setFieldErrors({ ...fieldErrors, packs_per_box: undefined })
                }}
                disabled={!formData.units_per_pack}
                placeholder="e.g., 10"
                aria-invalid={!!fieldErrors.packs_per_box}
                aria-describedby="packs_per_box-hint"
              />
              <FieldError message={fieldErrors.packs_per_box} />
            </div>
            <div>
              <Label htmlFor="box_label">Box name</Label>
              <Input
                id="box_label"
                value={formData.box_label}
                onChange={(e) => setFormData({ ...formData, box_label: e.target.value })}
                disabled={!formData.units_per_pack || !formData.packs_per_box}
                maxLength={50}
                placeholder="Box"
              />
              <FieldError message={fieldErrors.box_label} />
            </div>
          </div>
          <FieldHint id="packs_per_box-hint">
            {boxSummary(formData.units_per_pack, formData.packs_per_box, formData.box_label, formData.unit_label, formData.form)
              ?? (priceUnits
                ? `1 ${priceUnits.packLabel} = ${priceUnits.unitsPerPack} ${priceUnits.baseLabel}s`
                : "Optional. Leave blank for medicines sold as one piece (a bottle, a tube).")}
          </FieldHint>
          </MedicineFormSection>

          <MedicineFormSection title="Pricing & tax" icon={Wallet} description="Type the prices as the bill shows them; they are saved per single unit in NPR.">
            <VatRateNotice vatRatePercent={vatRatePercent} isLoading={vatRateLoading} />
            <PriceEntryControls
              idPrefix="create-medicine"
              value={priceEntry}
              onChange={setPriceEntry}
              units={priceUnits}
            />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cost_price">Cost price ({costSuffix})<RequiredMark /></Label>
              <div className="flex gap-2">
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                value={formData.cost_price}
                onChange={(e) => {
                  setFormData({ ...formData, cost_price: e.target.value })
                  if (fieldErrors.cost_price) setFieldErrors({ ...fieldErrors, cost_price: undefined })
                }}
                aria-invalid={!!fieldErrors.cost_price}
                required
              />
              {allowInr && (
                <PriceCurrencyToggle
                  label="Cost price currency"
                  value={priceEntry.costCurrency}
                  onChange={(costCurrency) => setPriceEntry({ ...priceEntry, costCurrency })}
                />
              )}
              </div>
              {costConverted && costPerUnit !== null && (
                <FieldHint>
                  Saved as <CurrencyDisplay amount={costPerUnit} /> per {baseUnitName}
                </FieldHint>
              )}
              <FieldError message={fieldErrors.cost_price} />
            </div>
            <div>
              <Label htmlFor="unit_price">Selling price / MRP ({sellingSuffix})<RequiredMark /></Label>
              <div className="flex gap-2">
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => {
                  setFormData({ ...formData, unit_price: e.target.value })
                  if (fieldErrors.unit_price) setFieldErrors({ ...fieldErrors, unit_price: undefined })
                }}
                aria-invalid={!!fieldErrors.unit_price}
                required
              />
              {allowInr && (
                <PriceCurrencyToggle
                  label="Selling price currency"
                  value={priceEntry.sellingCurrency}
                  onChange={(sellingCurrency) => setPriceEntry({ ...priceEntry, sellingCurrency })}
                />
              )}
              </div>
              {sellingConverted && sellingPerUnit !== null ? (
                <FieldHint>
                  Saved as <CurrencyDisplay amount={sellingPerUnit} /> per {baseUnitName}, VAT included when taxable
                </FieldHint>
              ) : (
                <FieldHint>What the customer pays, VAT included when taxable. Don&apos;t add tax on top.</FieldHint>
              )}
              <FieldError message={fieldErrors.unit_price} />
            </div>
          </div>

          {sellingPerUnit !== null && costPerUnit !== null && (
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Margin per {baseUnitName}</p>
                <p className="text-sm font-semibold text-primary">
                  <CurrencyDisplay amount={sellingPerUnit - costPerUnit} />
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Margin % (on cost)</p>
                <p className="text-sm font-semibold text-primary">
                  {costPerUnit > 0 && sellingPerUnit > costPerUnit
                    ? `${(((sellingPerUnit - costPerUnit) / costPerUnit) * 100).toFixed(2)}%`
                    : "0%"}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_taxable"
                checked={formData.is_taxable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_taxable: checked })}
              />
              <Label htmlFor="is_taxable">Taxable (VAT applies)</Label>
            </div>
            <FieldHint>
              Off by default: most medicines are VAT-exempt. Turn on for taxable items; sales then charge VAT
              {vatRatePercent ? ` at ${formatRate(vatRatePercent)}` : ""} (included in the selling price) and purchases
              claim input VAT.
            </FieldHint>
          </div>
          </MedicineFormSection>

          {!cardOnly && (
          <>
          <MedicineFormSection title="Opening stock & batch" icon={Boxes} description="Received as the first batch of this medicine. Leave the quantity at 0 to save just the medicine.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="stock_quantity">Quantity ({baseUnitName}s)<RequiredMark /></Label>
              <Input
                id="stock_quantity"
                type="number"
                value={formData.stock_quantity}
                onChange={(e) => {
                  setFormData({ ...formData, stock_quantity: e.target.value })
                  if (fieldErrors.stock_quantity) setFieldErrors({ ...fieldErrors, stock_quantity: undefined })
                }}
                aria-invalid={!!fieldErrors.stock_quantity}
                required
              />
              {openingQty > 0 && priceUnits && (
                <FieldHint>
                  {formatReceiptQuantity(openingQty, {
                    units_per_pack: Number.parseInt(formData.units_per_pack) || null,
                    packs_per_box: Number.parseInt(formData.packs_per_box) || null,
                    unit_label: formData.unit_label || null,
                    box_label: formData.box_label || null,
                    form: formData.form || null,
                  })}
                </FieldHint>
              )}
              <FieldError message={fieldErrors.stock_quantity} />
            </div>
            <div>
              {/* Batch and expiry belong to the opening stock: with 0 the medicine card is saved on its own. */}
              <Label htmlFor="batch_number">Batch number{openingQty > 0 && <RequiredMark />}</Label>
              <Input
                id="batch_number"
                value={formData.batch_number}
                onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                required={openingQty > 0}
                aria-describedby="batch_number-hint"
              />
              <FieldHint id="batch_number-hint">As printed on the pack. Used for recalls and FEFO selling.</FieldHint>
            </div>
            <div>
              <Label htmlFor="expiry_date">Expiry date{openingQty > 0 && <RequiredMark />}</Label>
              <DatePicker
                id="expiry_date"
                presets={EXPIRY_PRESETS}
                allowFuture
                aria-invalid={!!fieldErrors.expiry_date}
                value={formData.expiry_date}
                onChange={(value) => {
                  setFormData({ ...formData, expiry_date: value })
                  if (fieldErrors.expiry_date) setFieldErrors({ ...fieldErrors, expiry_date: undefined })
                }}
              />
              <FieldHint>Enter in AD or BS. Flagged 30 days before and blocked from sale after.</FieldHint>
              <FieldError message={fieldErrors.expiry_date} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="minimum_stock">Reorder level ({baseUnitName}s)<RequiredMark /></Label>
              <Input
                id="minimum_stock"
                type="number"
                value={formData.minimum_stock}
                onChange={(e) => {
                  setFormData({ ...formData, minimum_stock: e.target.value })
                  if (fieldErrors.minimum_stock) setFieldErrors({ ...fieldErrors, minimum_stock: undefined })
                }}
                aria-invalid={!!fieldErrors.minimum_stock}
                required
                aria-describedby="minimum_stock-hint"
              />
              <FieldHint id="minimum_stock-hint">Shown as low stock at or below this quantity.</FieldHint>
              <FieldError message={fieldErrors.minimum_stock} />
            </div>
            <div>
              <Label htmlFor="maximum_stock">Maximum stock ({baseUnitName}s)<RequiredMark /></Label>
              <Input
                id="maximum_stock"
                type="number"
                value={formData.maximum_stock}
                onChange={(e) => {
                  setFormData({ ...formData, maximum_stock: e.target.value })
                  if (fieldErrors.maximum_stock) setFieldErrors({ ...fieldErrors, maximum_stock: undefined })
                }}
                aria-invalid={!!fieldErrors.maximum_stock}
                required
              />
              <FieldError message={fieldErrors.maximum_stock} />
            </div>
          </div>
          </MedicineFormSection>

          <MedicineFormSection
            title="Supplier & bill"
            icon={Truck}
            description="Optional. Link the supplier this opening stock came from; without one, say how the stock was paid for."
          >
            <div>
              <Label htmlFor="supplier_id">Supplier</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className="w-full justify-between"
                  >
                    {formData.supplier_id
                      ? suppliers.find((supplier) => supplier.id === formData.supplier_id)?.name
                      : "Select supplier..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search suppliers..." />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 text-center text-sm">
                          <p className="mb-2">No supplier found.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowCreateSupplier(true)
                            }}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create new supplier
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setFormData({ ...formData, supplier_id: "" })
                            setSupplierOpen(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", formData.supplier_id === "" ? "opacity-100" : "opacity-0")} />
                          None
                        </CommandItem>
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            value={supplier.name}
                            onSelect={() => {
                              setFormData({ ...formData, supplier_id: supplier.id })
                              setSupplierOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", formData.supplier_id === supplier.id ? "opacity-100" : "opacity-0")} />
                            {supplier.name}
                          </CommandItem>
                        ))}
                        <CommandItem
                          value="__create_supplier__"
                          onSelect={() => {
                            setShowCreateSupplier(true)
                          }}
                          className="border-t"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create new supplier
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

          {formData.supplier_id && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="supplier_invoice_number">Supplier bill / invoice no.</Label>
                <Input
                  id="supplier_invoice_number"
                  value={formData.supplier_invoice_number}
                  onChange={(e) => setFormData({ ...formData, supplier_invoice_number: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="vat_amount">Input VAT on this bill</Label>
                  {vatEdited && formData.is_taxable && (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setVatEdited(false)
                        setFormData({ ...formData, vat_amount: "" })
                      }}
                    >
                      Use {formatRate(vatRatePercent ?? 0)} ({suggestedVat.toFixed(2)})
                    </button>
                  )}
                </div>
                <Input
                  id="vat_amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={vatFieldValue}
                  disabled={!formData.is_taxable}
                  onChange={(e) => {
                    setVatEdited(true)
                    setFormData({ ...formData, vat_amount: e.target.value })
                  }}
                  placeholder="0.00"
                  className="num"
                  aria-describedby="vat_amount-hint"
                />
                <FieldHint id="vat_amount-hint">
                  {!formData.is_taxable
                    ? "VAT-exempt medicine — no input VAT is claimed."
                    : vatEdited
                      ? "Using the VAT printed on the supplier bill."
                      : vatRatePercent
                        ? `Auto: ${formatRate(vatRatePercent)} of quantity × cost. Change it if the bill shows a different VAT.`
                        : "Enter the VAT shown on the supplier bill."}
                </FieldHint>
              </div>
              <div className="sm:col-span-2">
                {hasSupplierBill ? (
                  <BillPaymentFields
                    idPrefix="create-medicine"
                    value={payment}
                    onChange={(next) => {
                      setPayment(next)
                      if (paymentError) setPaymentError(validateBillPayment(next, openingBillTotal))
                    }}
                    total={openingBillTotal}
                    error={paymentError}
                  />
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    Add opening stock to record this supplier bill and choose whether it was paid.
                  </p>
                )}
              </div>
            </div>
          )}

          {hasNoSupplierStock && (
            <StockFundingFields
              idPrefix="create-medicine"
              value={funding}
              onChange={(next) => {
                setFunding(next)
                setFundingError(null)
              }}
              error={fundingError}
            />
          )}
          </MedicineFormSection>
          </>
          )}

          <MedicineFormSection title="Safety & storage" icon={ShieldCheck}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="prescription_required"
                checked={formData.prescription_required}
                onCheckedChange={(checked) => setFormData({ ...formData, prescription_required: checked })}
              />
              <Label htmlFor="prescription_required">Prescription required</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="controlled_substance"
                checked={formData.controlled_substance}
                onCheckedChange={(checked) => setFormData({ ...formData, controlled_substance: checked })}
              />
              <Label htmlFor="controlled_substance">Controlled substance</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="requires_cold_chain"
                checked={formData.requires_cold_chain}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_cold_chain: checked })}
              />
              <Label htmlFor="requires_cold_chain">Needs cold chain</Label>
            </div>
          </div>

          {formData.requires_cold_chain && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="storage_temp_min_c">Min temp (°C)</Label>
                <Input
                  id="storage_temp_min_c"
                  type="number"
                  step="0.1"
                  value={formData.storage_temp_min_c}
                  onChange={(e) => setFormData({ ...formData, storage_temp_min_c: e.target.value })}
                  placeholder="e.g., 2"
                />
              </div>
              <div>
                <Label htmlFor="storage_temp_max_c">Max temp (°C)</Label>
                <Input
                  id="storage_temp_max_c"
                  type="number"
                  step="0.1"
                  value={formData.storage_temp_max_c}
                  onChange={(e) => setFormData({ ...formData, storage_temp_max_c: e.target.value })}
                  placeholder="e.g., 8"
                />
              </div>
            </div>
          )}

          {/* Rarely needed at entry, so folded away to keep the form short. */}
          <details className="group rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground group-open:mb-3">
              More details: dosage, description, side effects, storage instructions
            </summary>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dosage">Dosage</Label>
                  <Input
                    id="dosage"
                    value={formData.dosage}
                    onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                    placeholder={formData.strength ? `Same as strength (${formData.strength})` : "e.g., 1 tablet twice daily"}
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="side_effects">Side effects</Label>
                <Textarea
                  id="side_effects"
                  value={formData.side_effects}
                  onChange={(e) => setFormData({ ...formData, side_effects: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="storage_instructions">Storage instructions</Label>
                <Textarea
                  id="storage_instructions"
                  value={formData.storage_instructions}
                  onChange={(e) => setFormData({ ...formData, storage_instructions: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </details>
          </MedicineFormSection>

          <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t bg-background px-1 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Adding…">
              Add medicine
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newCategoryName">Category name<RequiredMark /></Label>
              <Input
                id="newCategoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateCategory()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateCategory(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCategory}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Supplier Dialog */}
      <Dialog open={showCreateSupplier} onOpenChange={setShowCreateSupplier}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newSupplierName">Supplier name<RequiredMark /></Label>
              <Input
                id="newSupplierName"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Enter supplier name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    askCreateSupplier()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateSupplier(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={askCreateSupplier}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmNewSupplierDialog
        open={supplierPendingConfirm !== null}
        supplierNames={supplierPendingConfirm ? [supplierPendingConfirm] : []}
        onOpenChange={(open) => {
          if (!open) setSupplierPendingConfirm(null)
        }}
        onConfirm={() => void handleCreateSupplier()}
      />
      <DuplicateMedicineDialog
        open={duplicates.length > 0}
        duplicates={duplicates}
        hasStock={openingQty > 0}
        stockSummary={[
          `${openingQty} units`,
          formData.batch_number.trim() && `batch ${formData.batch_number.trim()}`,
          formData.expiry_date && `expires ${formData.expiry_date.slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(", ")}
        busy={duplicateBusy}
        onAddToExisting={(existing) => void handleAddToExisting(existing)}
        onUseExisting={(existing) => {
          setDuplicates([])
          setFormData(emptyFormData)
          onCreate({ id: existing.id, name: existing.name })
          onClose()
        }}
        onCreateAnyway={() => void handleCreateAnyway()}
        onCancel={() => setDuplicates([])}
      />
    </Dialog>
    <StockReceiptSummaryDialog bills={receipt} onClose={() => setReceipt(null)} />
    </>
  )
}
