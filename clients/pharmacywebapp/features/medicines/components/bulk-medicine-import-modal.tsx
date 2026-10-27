"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Download,
  Plus,
  Pencil,
  Trash2,
  Check,
  ChevronsUpDown,
  Receipt,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { medicinesApi } from "@/features/medicines/api-client"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { suppliersApi } from "@/features/suppliers/api-client"
import ConfirmNewSupplierDialog from "@/features/suppliers/components/confirm-new-supplier-dialog"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { nepalMedicineCatalogApi, NepalMedicineCatalogItem } from "@/features/medicines/api-client-nepal-catalog"
import { CurrencyDisplay } from "@/components/currency-display"
import { supplierNameSchema } from "@/lib/utils/validation"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DatePicker, EXPIRY_PRESETS } from "@/components/ui/date-picker"
import { BillPaymentFields } from "@/features/medicines/components/bill-payment-fields"
import { VatRateNotice } from "@/features/medicines/components/vat-rate-notice"
import { formatRate, suggestedPurchaseVat } from "@/features/medicines/lib/purchase-vat"
import { useVatRate } from "@/features/settings/hooks/use-vat-rate"
import {
  billTotal,
  emptyBillPayment,
  toBillPaymentInput,
  validateBillPayment,
  type BillPaymentState,
} from "@/features/medicines/lib/bill-payment"
import { PARTY_PAYMENT_METHODS, type PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"
import { normalizeCsvDate } from "@/features/medicines/lib/csv-date"
import { csvTextToMatrix, numberCell } from "@/features/imports/lib/spreadsheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { boxSummary } from "@/features/medicines/lib/box-unit"
import { createIdempotencyKeyTracker } from "@/lib/api/idempotency"
import { nepalYmdOf } from "@/lib/utils/nepal-time"
import { useCurrency } from "@/lib/contexts/currency-context"
import { PriceCurrencyToggle, PriceEntryControls } from "@/features/medicines/components/price-entry-controls"
import {
  DEFAULT_PRICE_ENTRY,
  formUnits,
  parsePriceBasis,
  parsePriceCurrency,
  priceBasisLabel,
  priceFieldSuffix,
  priceIsConverted,
  toBaseUnitPrice,
  type PriceEntry,
} from "@/features/medicines/lib/price-entry"
import { StockReceiptSummaryDialog } from "@/features/medicines/components/stock-receipt-summary-dialog"
import { receivedBills, supplierPaymentNote, type ReceivedStockBill } from "@/features/medicines/lib/stock-receipt-summary"

interface BulkMedicineImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** When opened from a supplier's page, pre-fills the first bill group's supplier. */
  initialSupplierName?: string
}

interface MedicineRow {
  id: string
  name: string
  generic_name?: string
  strength: string
  form: string
  unit_price: number
  cost_price: number
  stock_quantity: number
  minimum_stock: number
  category?: string
  /** Input VAT for this line - always the figure that will be sent (auto or typed). */
  vat_amount?: number
  /** True when the VAT came from the user or the CSV (the bill's figure) rather than the Settings rate. */
  vat_edited?: boolean
  expiry_date?: string
  batch_number?: string
  rack_location?: string
  is_taxable: boolean
  prescription_required: boolean
  controlled_substance: boolean
  // The rest of the medicine card, as on the single "Add medicine" form. Used when the row creates a new medicine.
  brand_name?: string
  description?: string
  dosage?: string
  barcode?: string
  /** Blank = 10 x the reorder level. */
  maximum_stock?: number
  units_per_pack?: number
  unit_label?: string
  packs_per_box?: number
  box_label?: string
  requires_cold_chain?: boolean
  storage_temp_min_c?: number
  storage_temp_max_c?: number
  side_effects?: string
  storage_instructions?: string
  errors?: string[]
}

/** The forms the single "Add medicine" form offers (create-medicine-modal.tsx). */
const MEDICINE_FORMS = [
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "syrup", label: "Syrup" },
  { value: "injection", label: "Injection" },
  { value: "cream", label: "Cream" },
  { value: "drops", label: "Drops" },
]

/** The dropdown value for a row's form: a known form whatever its case ("Tablet" from a CSV is "tablet"), else as typed. */
function formOptionValue(form: string): string {
  const known = MEDICINE_FORMS.find((f) => f.value === form.trim().toLowerCase())
  return known ? known.value : form.trim()
}

/** An optional number input: blank is undefined, anything else the number (NaN is flagged by validateRow). */
function optionalNumber(text: string): number | undefined {
  return text.trim() === "" ? undefined : Number(text)
}

/** One supplier bill — the supplier, its bill/invoice number, and receipt date are
 *  entered once here and apply to every medicine line under it. On submit, every
 *  group with a supplier is posted as ONE consolidated goods receipt / supplier
 *  ledger entry, not one per medicine (see medicinesApi.bulkCreate). A group with no
 *  supplier just creates its medicines individually, same as before. */
interface BillGroup {
  id: string
  supplier: string
  supplierInvoiceNumber: string
  receiptDate: string
  /** On credit (default) or paid at entry; only applies when the group has a supplier. */
  payment: BillPaymentState
  rows: MedicineRow[]
  groupError?: string | null
}

/** CSV payment columns: payment_status (paid / credit), payment_method, paid_amount, payment_reference. */
function csvPayment(raw: Record<string, string>): BillPaymentState {
  const status = (raw.payment_status || raw["payment status"] || raw.paid || "").trim().toLowerCase()
  const amount = (raw.paid_amount || raw["paid amount"] || "").trim()
  const method = (raw.payment_method || raw["payment method"] || "cash").trim().toLowerCase()
  const paid = ["paid", "yes", "true", "y"].includes(status) || (amount !== "" && Number(amount) > 0)
  return {
    ...emptyBillPayment(),
    paid,
    method: (PARTY_PAYMENT_METHODS.some((m) => m.value === method) ? method : "cash") as PartyPaymentMethod,
    amount,
    reference: (raw.payment_reference || raw["payment reference"] || "").trim(),
  }
}

/** Today on the Nepal calendar — the business day the server records a bill on (not the UTC date). */
const todayYmd = () => nepalYmdOf()

/** A CSV date cell as "yyyy-MM-dd" when it can be read unambiguously; otherwise the text as typed, so the
 *  row shows it with the reason (validateRow / validateGroup) instead of sending it to the server. */
function csvDateCell(value: string | undefined): string {
  const text = (value ?? "").trim()
  return normalizeCsvDate(text).ymd ?? text
}

/** A CSV number cell: "1,200" and "Rs 50" read as numbers, blank is the fallback, anything else NaN (flagged by
 *  validateRow) — never parseFloat's silent "1,200" → 1. */
function csvNumberCell(value: string | undefined, fallback: number): number {
  const { value: n, error } = numberCell(value, "")
  if (error) return Number.NaN
  return n ?? fallback
}

/** A CSV price cell as the per-unit NPR price: the optional `price_per` (unit / strip / box) and `price_currency`
 *  (NPR / INR) columns say how the bill quoted it. A cell that isn't a number stays NaN for validateRow. */
function csvPrice(raw: Record<string, string>, cell: string | undefined, kind: "selling" | "cost"): number {
  const amount = csvNumberCell(cell, 0)
  if (!Number.isFinite(amount)) return amount
  const entry: PriceEntry = {
    basis: parsePriceBasis(raw.price_per || raw["price per"]),
    costCurrency: parsePriceCurrency(raw.cost_currency || raw["cost currency"] || raw.price_currency || raw["price currency"] || raw.currency),
    sellingCurrency: parsePriceCurrency(
      raw.selling_currency || raw["selling currency"] || raw.price_currency || raw["price currency"] || raw.currency,
    ),
  }
  const units = formUnits({
    units_per_pack: raw.units_per_pack || raw["units per pack"],
    packs_per_box: raw.packs_per_box || raw["strips per box"] || raw["packs per box"],
    unit_label: raw.unit_label || raw["unit label"],
    box_label: raw.box_label || raw["box label"],
    form: raw.form,
  })
  return toBaseUnitPrice(amount, entry, units, kind) ?? amount
}

/** An optional CSV number cell: blank is undefined (not set), otherwise as csvNumberCell. */
function optionalCsvNumber(value: string | undefined): number | undefined {
  return (value ?? "").trim() === "" ? undefined : csvNumberCell(value, 0)
}

/** Supplier names match regardless of case and stray spaces ("ABC  Pharma " is "abc pharma"). */
function supplierKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

/** Keeps a row's VAT in step with the Settings rate: exempt lines carry none, a typed figure is kept,
 *  otherwise quantity x cost x rate. */
function withResolvedVat(row: MedicineRow, vatRatePercent: number): MedicineRow {
  if (!row.is_taxable) return { ...row, vat_amount: 0 }
  if (row.vat_edited) return row
  return { ...row, vat_amount: suggestedPurchaseVat(row.stock_quantity, row.cost_price, vatRatePercent, true) }
}

function validateRow(row: MedicineRow): string[] {
  const errors: string[] = []
  if (!row.name || row.name.trim().length < 2) errors.push("Name is required (min 2 characters)")
  if (!row.form || row.form.trim().length < 1) errors.push("Form is required")
  // Written as !(x > 0) so a cell that wasn't a number (NaN) is caught too.
  if (!(row.unit_price > 0)) errors.push("Unit price must be a number greater than 0")
  if (!(row.cost_price > 0)) errors.push("Cost price must be a number greater than 0")
  // 0 is allowed: the row creates just the medicine card (e.g. for stock that arrives on consignment).
  if (!(row.stock_quantity >= 0)) errors.push("Stock quantity must be a number, 0 or more")
  if (!(row.minimum_stock >= 0)) errors.push("Minimum stock must be a number, 0 or more")
  if (!((row.vat_amount ?? 0) >= 0)) errors.push("VAT amount must be a number, 0 or more")
  if (row.maximum_stock !== undefined) {
    if (!(row.maximum_stock >= 0)) errors.push("Maximum stock must be a number, 0 or more")
    else if (row.maximum_stock > 0 && row.maximum_stock < row.minimum_stock)
      errors.push("Maximum stock can't be below the reorder level")
  }
  if (row.units_per_pack !== undefined && !(Number.isInteger(row.units_per_pack) && row.units_per_pack >= 1))
    errors.push("Units per pack must be a whole number, 1 or more")
  if (row.packs_per_box !== undefined) {
    if (row.units_per_pack === undefined) errors.push("Set the units per pack before the strips per box")
    else if (!(Number.isInteger(row.packs_per_box) && row.packs_per_box >= 2)) errors.push("A box holds at least 2 strips")
  }
  for (const [value, label] of [[row.storage_temp_min_c, "Min temp"], [row.storage_temp_max_c, "Max temp"]] as const) {
    if (value !== undefined && !(value >= -50 && value <= 50)) errors.push(`${label} must be between -50 and 50 °C`)
  }
  const expiry = normalizeCsvDate(row.expiry_date, "Expiry date")
  if (expiry.error) errors.push(expiry.error)
  else if (!expiry.ymd && row.stock_quantity > 0) errors.push("Expiry date is required")
  return errors
}

/** Empty groups (no rows yet) are never an error — they're just excluded from
 *  submit. Only a non-empty group with a supplier but no bill number is a real
 *  problem, since the server requires a bill number to post a consolidated receipt. */
function validateGroup(group: BillGroup): string | null {
  if (group.rows.length === 0) return null
  const receipt = normalizeCsvDate(group.receiptDate, "Receipt date")
  if (receipt.error) return receipt.error
  if (group.supplier.trim() && !group.supplierInvoiceNumber.trim()) {
    return "Bill/invoice number is required when a supplier is set"
  }
  if (group.supplier.trim()) return validateBillPayment(group.payment, billTotal(group.rows))
  return null
}

function revalidate(groups: BillGroup[]): BillGroup[] {
  return groups.map((g) => ({
    ...g,
    groupError: validateGroup(g),
    rows: g.rows.map((r) => ({ ...r, errors: validateRow(r) })),
  }))
}

export default function BulkMedicineImportModal({
  isOpen,
  onClose,
  onSuccess,
  initialSupplierName,
}: BulkMedicineImportModalProps) {
  const queryClient = useQueryClient()
  const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
  const [activeTab, setActiveTab] = useState<"manual" | "csv">("manual")
  const [csvText, setCsvText] = useState("")
  const [groups, setGroups] = useState<BillGroup[]>([])
  const { data: vatRatePercent, isLoading: vatRateLoading } = useVatRate()
  const vatRate = vatRatePercent ?? 0
  const [isLoading, setIsLoading] = useState(false)
  const [pendingNewSuppliers, setPendingNewSuppliers] = useState<string[] | null>(null)
  const allowNewSuppliersRef = useRef(false)
  /** One Idempotency-Key per import, reused when the same import is submitted again after a failure. */
  const importKeys = useRef(createIdempotencyKeyTracker())
  const { toast } = useToast()

  const emptyGroup = (): BillGroup => ({
    id: crypto.randomUUID(),
    supplier: initialSupplierName || "",
    supplierInvoiceNumber: "",
    receiptDate: todayYmd(),
    payment: emptyBillPayment(),
    rows: [],
  })

  // Seed one empty bill group the first time the modal opens for this session.
  useEffect(() => {
    if (isOpen && groups.length === 0) {
      setGroups([emptyGroup()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Row add/edit dialog: "Add Medicine" opens this with a blank draft scoped to one
  // bill group; editing a row opens it pre-filled. Saving pushes/updates the row in
  // `groups` only — the API call happens once, in bulk, when "Import" is clicked.
  const emptyDraftRow = (): MedicineRow => ({
    id: crypto.randomUUID(),
    name: "",
    generic_name: "",
    strength: "",
    form: "",
    unit_price: 0,
    cost_price: 0,
    stock_quantity: 0,
    minimum_stock: 10,
    category: "",
    vat_amount: 0,
    vat_edited: false,
    expiry_date: "",
    batch_number: "",
    rack_location: "",
    // Most medicines are VAT-exempt in Nepal; turn it on for the taxable ones.
    is_taxable: false,
    prescription_required: false,
    controlled_substance: false,
    brand_name: "",
    description: "",
    dosage: "",
    barcode: "",
    unit_label: "",
    box_label: "",
    requires_cold_chain: false,
    side_effects: "",
    storage_instructions: "",
  })
  const [rowDialogOpen, setRowDialogOpen] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [draftRow, setDraftRow] = useState<MedicineRow>(emptyDraftRow())
  /** The row dialog's prices as typed (per strip, in INR, ...); the row itself holds them per unit in NPR. */
  const [draftPrice, setDraftPrice] = useState<{ entry: PriceEntry; selling: string; cost: string }>({
    entry: DEFAULT_PRICE_ENTRY,
    selling: "",
    cost: "",
  })
  const { currentCurrency } = useCurrency()
  /** The stock just imported, shown as receipt details once the import closes. */
  const [receipt, setReceipt] = useState<ReceivedStockBill[] | null>(null)
  const [draftErrors, setDraftErrors] = useState<string[]>([])

  // Existing categories/suppliers, fetched once the modal opens, so the row
  // form can offer a searchable pick-from-directory experience instead of
  // free-typed text that silently creates duplicates.
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState<string | null>(null)
  const [supplierSearch, setSupplierSearch] = useState("")

  // Medicine-name catalog search for the row dialog, mirroring the same
  // lookup used on the single "Add Medicine" form.
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogItems, setCatalogItems] = useState<NepalMedicineCatalogItem[]>([])
  /** Name just filled from a directory pick. Searching that same string again would reopen the list on the item they already chose. */
  const catalogSelectionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    ;(async () => {
      const [categoryResult, supplierResult] = await Promise.all([
        categoriesApi.getCategories(),
        suppliersApi.getSupplierOptions({ includeInactive: true }),
      ])
      if (!categoryResult.error) setCategories(categoryResult.data)
      if (!supplierResult.error) setSuppliers(supplierResult.data)
    })()
  }, [isOpen])

  useEffect(() => {
    const keyword = draftRow.name.trim()
    if (!rowDialogOpen || keyword.length < 2 || catalogSelectionRef.current === keyword) {
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
  }, [draftRow.name, rowDialogOpen])

  const applyCatalogSuggestion = (item: NepalMedicineCatalogItem) => {
    const name = item.brand_name || draftRow.name
    catalogSelectionRef.current = name.trim()
    setDraftRow((prev) => ({
      ...prev,
      name,
      generic_name: item.generic_name || prev.generic_name,
      strength: item.strength || prev.strength,
      form: item.form ? formOptionValue(item.form) : prev.form,
      unit_price: item.unit_price ?? prev.unit_price,
      cost_price: item.cost_price ?? prev.cost_price,
      category: item.category_name || prev.category,
      prescription_required: item.prescription_required ?? prev.prescription_required,
    }))
    setDraftPrice((prev) => ({
      entry: DEFAULT_PRICE_ENTRY,
      selling: item.unit_price != null ? String(item.unit_price) : prev.selling,
      cost: item.cost_price != null ? String(item.cost_price) : prev.cost,
    }))
    setCatalogItems([])
    setCatalogOpen(false)
  }

  // Creates the category immediately (mirrors the single "Add Medicine" form)
  // instead of only stashing free text that gets resolved at import time —
  // so it shows up in the directory right away for the rest of this session.
  const createCategoryInline = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreatingCategory(true)
    try {
      const { data, error } = await categoriesApi.createCategory(trimmed)
      if (error || !data) throw new Error(error ?? "Failed to create category")
      setCategories((prev) => [...prev, data])
      updateDraftField("category", data.name)
      setCategorySearch("")
      setCategoryOpen(false)
      toast({ title: "Category created", description: `"${data.name}" is now available.` })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create category",
        variant: "destructive",
      })
    } finally {
      setCreatingCategory(false)
    }
  }

  /** Parses CSV rows, then groups them by (supplier, supplier_invoice_number) so
   *  same-bill rows land in the same card, converging with the manual-entry model. */
  const parseCSV = async (text: string): Promise<BillGroup[]> => {
    // Quote-aware: a cell like "Paracetamol, Caffeine" or Excel's "1,200" must stay one cell. Splitting each line
    // on "," shifted every later column (form became the strength, unit price became the form, ...).
    const matrix = await csvTextToMatrix(text)
    if (matrix.length < 2) return []

    const headers = matrix[0].map((h) => h.toLowerCase())
    const parsedGroups = new Map<string, BillGroup>()

    for (let i = 1; i < matrix.length; i++) {
      const values = matrix[i]
      // Short rows are padded with "" (a missing trailing cell is blank), never silently dropped.
      if (values.every((v) => v === "")) continue

      const raw: any = {}
      headers.forEach((header, index) => {
        raw[header] = values[index] ?? ""
      })

      const supplier = raw.supplier || initialSupplierName || ""
      const invoiceNumber =
        raw.supplier_invoice_number || raw["supplier invoice number"] || raw["invoice number"] || raw.invoice_number || ""
      const groupKey = `${supplier.trim().toLowerCase()}|${invoiceNumber.trim().toLowerCase()}`

      if (!parsedGroups.has(groupKey)) {
        parsedGroups.set(groupKey, {
          id: crypto.randomUUID(),
          supplier,
          supplierInvoiceNumber: invoiceNumber,
          receiptDate: csvDateCell(raw.receipt_date || raw["receipt date"]) || todayYmd(),
          payment: csvPayment(raw),
          rows: [],
        })
      }

      parsedGroups.get(groupKey)!.rows.push({
        id: crypto.randomUUID(),
        name: raw.name || "",
        generic_name: raw.generic_name || raw["generic name"] || "",
        strength: raw.strength || "",
        form: formOptionValue(raw.form || ""),
        unit_price: csvPrice(raw, raw.unit_price || raw["unit price"], "selling"),
        cost_price: csvPrice(raw, raw.cost_price || raw["cost price"], "cost"),
        stock_quantity: csvNumberCell(raw.stock_quantity || raw["stock quantity"], 0),
        minimum_stock: csvNumberCell(raw.minimum_stock || raw["minimum stock"], 10),
        category: raw.category || "",
        // A VAT figure in the file is the bill's own; a blank one is worked out from the Settings rate.
        vat_amount: csvNumberCell(raw.vat_amount || raw["vat amount"], 0),
        vat_edited: (raw.vat_amount || raw["vat amount"] || "").trim() !== "",
        expiry_date: csvDateCell(raw.expiry_date || raw["expiry date"]),
        batch_number: raw.batch_number || raw["batch number"] || "",
        rack_location: raw.rack_location || raw.rack || raw["rack location"] || "",
        // Blank means exempt, like the forms; "true", "yes", "y" or "1" marks a taxable medicine.
        is_taxable: ["true", "yes", "y", "1"].includes((raw.is_taxable || raw["is taxable"] || raw["taxable"] || "").trim().toLowerCase()),
        prescription_required: (raw.prescription_required || raw["prescription required"] || "false").toLowerCase() === "true",
        controlled_substance: (raw.controlled_substance || raw["controlled substance"] || "false").toLowerCase() === "true",
        // Optional medicine-card columns (blank = not set).
        brand_name: raw.brand_name || raw["brand name"] || "",
        description: raw.description || "",
        dosage: raw.dosage || "",
        barcode: raw.barcode || "",
        maximum_stock: optionalCsvNumber(raw.maximum_stock || raw["maximum stock"]),
        units_per_pack: optionalCsvNumber(raw.units_per_pack || raw["units per pack"]),
        unit_label: raw.unit_label || raw["unit label"] || "",
        packs_per_box: optionalCsvNumber(raw.packs_per_box || raw["strips per box"] || raw["packs per box"]),
        box_label: raw.box_label || raw["box label"] || "",
      })
    }

    return [...parsedGroups.values()]
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const applyCsvText = async (text: string) => {
    if (!text.trim()) {
      toast({ title: "Error", description: "Please enter CSV data", variant: "destructive" })
      return
    }

    const parsed = await parseCSV(text)
    if (parsed.length === 0) {
      toast({ title: "Error", description: "No valid data found in CSV", variant: "destructive" })
      return
    }

    const exemptWithVat = parsed.reduce(
      (n, g) => n + g.rows.filter((r) => !r.is_taxable && (r.vat_amount ?? 0) > 0).length,
      0,
    )
    const validated = revalidate(
      parsed.map((g) => ({ ...g, rows: g.rows.map((r) => withResolvedVat(r, vatRate)) })),
    )
    if (exemptWithVat > 0) {
      toast({
        title: "VAT removed on exempt medicines",
        description: `${exemptWithVat} row(s) are marked not taxable, so their VAT was set to 0.`,
      })
    }
    setCsvText(text)
    setGroups(validated)
    setActiveTab("manual")

    const totalRows = validated.reduce((sum, g) => sum + g.rows.length, 0)
    toast({
      title: "CSV Parsed",
      description: `Found ${totalRows} medicine(s) across ${validated.length} bill(s). Review below before importing.`,
    })
  }

  const handleCSVParse = () => {
    applyCsvText(csvText).catch((error) =>
      toast({
        title: "Could not read CSV",
        description: error instanceof Error ? error.message : "Check the CSV and try again.",
        variant: "destructive",
      }),
    )
  }

  const handleImportFile = async (file: File) => {
    const lower = file.name.toLowerCase()
    try {
      let text = ""
      if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
        text = await file.text()
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const XLSX = await import("xlsx")
        // dateNF on read turns default-format date cells into yyyy-mm-dd rather than "12/31/27".
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dateNF: "yyyy-mm-dd" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        if (!sheet) throw new Error("That spreadsheet has no sheets")
        text = XLSX.utils.sheet_to_csv(sheet)
      } else {
        toast({
          title: "Unsupported file",
          description: "Upload a CSV or Excel file (.csv, .xlsx, .xls).",
          variant: "destructive",
        })
        return
      }
      await applyCsvText(text)
    } catch (error) {
      toast({
        title: "Could not read file",
        description: error instanceof Error ? error.message : "Choose a CSV or Excel file and try again.",
        variant: "destructive",
      })
    }
  }

  /** The typed prices converted onto the row (per unit, NPR), with its VAT recomputed. */
  const withDraftPrices = (row: MedicineRow, price: typeof draftPrice): MedicineRow => {
    const units = formUnits(row)
    return withResolvedVat(
      {
        ...row,
        unit_price: toBaseUnitPrice(price.selling, price.entry, units, "selling") ?? 0,
        cost_price: toBaseUnitPrice(price.cost, price.entry, units, "cost") ?? 0,
      },
      vatRate,
    )
  }

  const updateDraftPrice = (next: typeof draftPrice) => {
    setDraftPrice(next)
    setDraftRow((prev) => withDraftPrices(prev, next))
  }

  /** A row's stored prices, shown back per unit in NPR when the dialog opens. */
  const resetDraftPrice = (row: MedicineRow) =>
    setDraftPrice({
      entry: DEFAULT_PRICE_ENTRY,
      selling: row.unit_price ? String(row.unit_price) : "",
      cost: row.cost_price ? String(row.cost_price) : "",
    })

  const openAddRow = (groupId: string) => {
    setActiveGroupId(groupId)
    setEditingRowId(null)
    setDraftRow(emptyDraftRow())
    resetDraftPrice(emptyDraftRow())
    setDraftErrors([])
    catalogSelectionRef.current = null
    setCatalogOpen(false)
    setCatalogItems([])
    setCategorySearch("")
    setRowDialogOpen(true)
  }

  const openEditRow = (groupId: string, row: MedicineRow) => {
    setActiveGroupId(groupId)
    setEditingRowId(row.id)
    setDraftRow({ ...row })
    resetDraftPrice(row)
    setDraftErrors([])
    catalogSelectionRef.current = null
    setCatalogOpen(false)
    setCatalogItems([])
    setCategorySearch("")
    setRowDialogOpen(true)
  }

  const updateDraftField = (field: keyof MedicineRow, value: any) => {
    setDraftRow((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "vat_amount") next.vat_edited = true
      // Pack sizes change what a per-strip or per-box price is per unit.
      return withDraftPrices(next, draftPrice)
    })
  }

  // Auto VAT follows the Settings rate once it loads (or changes) for every row the user hasn't overridden.
  useEffect(() => {
    setGroups((prev) =>
      prev.length === 0
        ? prev
        : revalidate(prev.map((g) => ({ ...g, rows: g.rows.map((r) => withResolvedVat(r, vatRate)) }))),
    )
    setDraftRow((prev) => withResolvedVat(prev, vatRate))
  }, [vatRate])

  const saveDraftRow = (andAddAnother = false) => {
    const errors = validateRow(draftRow)
    if (errors.length > 0) {
      setDraftErrors(errors)
      return
    }
    if (!activeGroupId) return

    setGroups((prev) =>
      revalidate(
        prev.map((g) => {
          if (g.id !== activeGroupId) return g
          const rows = editingRowId
            ? g.rows.map((r) => (r.id === editingRowId ? { ...draftRow, id: editingRowId } : r))
            : [...g.rows, draftRow]
          return { ...g, rows }
        })
      )
    )
    if (andAddAnother) {
      // Keep the dialog open, scoped to the same bill group, so rapid multi-medicine
      // entry (Ctrl+Shift+Enter) doesn't require re-opening the dialog each time.
      setEditingRowId(null)
      setDraftRow(emptyDraftRow())
      resetDraftPrice(emptyDraftRow())
      setDraftErrors([])
      catalogSelectionRef.current = null
      setCatalogOpen(false)
      setCatalogItems([])
    } else {
      setRowDialogOpen(false)
    }
  }

  const addGroup = () => setGroups((prev) => [...prev, emptyGroup()])

  const removeGroup = (groupId: string) => setGroups((prev) => prev.filter((g) => g.id !== groupId))

  const removeRow = (groupId: string, rowId: string) =>
    setGroups((prev) =>
      revalidate(prev.map((g) => (g.id === groupId ? { ...g, rows: g.rows.filter((r) => r.id !== rowId) } : g)))
    )

  const updateGroupField = (groupId: string, field: "supplier" | "supplierInvoiceNumber" | "receiptDate", value: string) =>
    setGroups((prev) => revalidate(prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g))))

  const updateGroupPayment = (groupId: string, payment: BillPaymentState) =>
    setGroups((prev) => revalidate(prev.map((g) => (g.id === groupId ? { ...g, payment } : g))))

  // Keyboard shortcuts for the manual-entry list: Ctrl/Cmd+G adds a bill group,
  // Ctrl/Cmd+Enter opens "Add Medicine" scoped to the last group (the one most
  // likely being filled in). Modifier-gated so typing in inputs is unaffected.
  useEffect(() => {
    if (!isOpen || rowDialogOpen) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === "g" || e.key === "G") {
        e.preventDefault()
        addGroup()
      } else if (e.key === "Enter") {
        e.preventDefault()
        const target = groups[groups.length - 1]
        if (target) openAddRow(target.id)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, rowDialogOpen, groups])

  // Row dialog shortcuts: Ctrl/Cmd+Enter saves and closes, Ctrl/Cmd+Shift+Enter
  // saves and keeps the dialog open (scoped to the same bill group) for rapid
  // back-to-back medicine entry.
  useEffect(() => {
    if (!rowDialogOpen) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.key !== "Enter") return
      e.preventDefault()
      saveDraftRow(e.shiftKey)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [rowDialogOpen, draftRow, activeGroupId, editingRowId])

  const draftUnits = formUnits(draftRow)
  const draftCostConverted = priceIsConverted(draftPrice.entry, draftUnits, "cost")
  const draftSellingConverted = priceIsConverted(draftPrice.entry, draftUnits, "selling")
  const allowInr = currentCurrency.code === "NPR"
  const draftBaseUnit = priceBasisLabel("base", draftUnits)
  const draftCostSuffix = priceFieldSuffix(draftPrice.entry, draftUnits, "cost")
  const draftSellingSuffix = priceFieldSuffix(draftPrice.entry, draftUnits, "selling")

  const nonEmptyGroups = groups.filter((g) => g.rows.length > 0)
  const totalRows = nonEmptyGroups.reduce((sum, g) => sum + g.rows.length, 0)
  const totalValidRows = nonEmptyGroups.reduce((sum, g) => sum + g.rows.filter((r) => (r.errors?.length ?? 0) === 0).length, 0)
  const hasGroupErrors = nonEmptyGroups.some((g) => !!g.groupError)
  const canImport = nonEmptyGroups.length > 0 && !hasGroupErrors && totalValidRows === totalRows

  const handleSubmit = async () => {
    if (!canImport) {
      toast({
        title: "Error",
        description: totalRows === 0 ? "Please add at least one medicine" : "Fix the highlighted issues before importing",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const categoryResult = await categoriesApi.getCategories()
      // Every supplier (not just the first page of 50), or existing suppliers would be re-created as new.
      const supplierResult = await suppliersApi.getAllSuppliers()
      if (categoryResult.error) throw new Error(categoryResult.error)
      if (supplierResult.error) throw new Error(supplierResult.error)

      const categoryMap = new Map(categoryResult.data.map((c) => [c.name.toLowerCase(), c.id]))
      const supplierMap = new Map(supplierResult.data.map((s) => [supplierKey(s.name), s.id]))

      const newSupplierNames = [
        ...new Map(
          nonEmptyGroups
            .map((group) => group.supplier.trim())
            .filter((name) => name && !supplierMap.has(supplierKey(name)))
            .map((name) => [supplierKey(name), name])
        ).values(),
      ]
      if (newSupplierNames.length > 0 && !allowNewSuppliersRef.current) {
        for (const name of newSupplierNames) {
          const nameCheck = supplierNameSchema.safeParse(name)
          if (!nameCheck.success) {
            throw new Error(nameCheck.error.issues[0]?.message || "Supplier name is invalid")
          }
        }
        setPendingNewSuppliers(newSupplierNames)
        setIsLoading(false)
        return
      }
      allowNewSuppliersRef.current = false

      const payloadGroups: Array<{
        supplierId: string | null
        supplierInvoiceNumber?: string | null
        receiptDate: string
        payment: ReturnType<typeof toBillPaymentInput>
        rows: any[]
      }> = []

      for (const group of nonEmptyGroups) {
        let supplierId: string | null = null
        const supName = supplierKey(group.supplier)
        if (supName) {
          const existing = supplierMap.get(supName)
          if (existing) {
            supplierId = existing
          } else {
            const nameCheck = supplierNameSchema.safeParse(group.supplier.trim())
            if (!nameCheck.success) {
              throw new Error(nameCheck.error.issues[0]?.message || "Supplier name is invalid")
            }
            const created = await suppliersApi.createSupplier({ name: nameCheck.data })
            if (created.error || !created.data) {
              throw new Error(created.error || `Failed to create supplier "${group.supplier.trim()}"`)
            }
            supplierId = created.data.id
            supplierMap.set(supName, created.data.id)
          }
        }

        const rows = []
        for (const row of group.rows) {
          let categoryId: string | null = null
          const catName = row.category?.trim().toLowerCase()
          if (catName) {
            const existing = categoryMap.get(catName)
            if (existing) {
              categoryId = existing
            } else {
              const created = await categoriesApi.createCategory(row.category!.trim())
              if (created.error || !created.data) {
                throw new Error(created.error || `Failed to create category "${row.category!.trim()}"`)
              }
              categoryId = created.data.id
              categoryMap.set(catName, created.data.id)
            }
          }

          rows.push({
            name: row.name.trim(),
            generic_name: row.generic_name?.trim() || null,
            brand_name: row.brand_name?.trim() || null,
            strength: row.strength.trim(),
            form: row.form.trim(),
            unit_price: row.unit_price,
            cost_price: row.cost_price,
            stock_quantity: row.stock_quantity,
            minimum_stock: row.minimum_stock,
            maximum_stock: row.maximum_stock ?? row.minimum_stock * 10,
            // Always "yyyy-MM-dd" (validateRow refused anything else), the shape the API's DateOnly binds.
            expiry_date: normalizeCsvDate(row.expiry_date).ymd,
            batch_number: row.batch_number?.trim() || null,
            rack_location: row.rack_location?.trim() || null,
            is_taxable: row.is_taxable,
            category_id: categoryId,
            description: row.description?.trim() || null,
            controlled_substance: row.controlled_substance,
            prescription_required: row.prescription_required,
            dosage: row.dosage?.trim() || null,
            side_effects: row.side_effects?.trim() || null,
            storage_instructions: row.storage_instructions?.trim() || null,
            barcode: row.barcode?.trim() || null,
            units_per_pack: row.units_per_pack ?? null,
            unit_label: row.unit_label?.trim() || null,
            packs_per_box: row.units_per_pack !== undefined ? row.packs_per_box ?? null : null,
            box_label: row.units_per_pack !== undefined && row.packs_per_box !== undefined ? row.box_label?.trim() || null : null,
            requires_cold_chain: row.requires_cold_chain ?? false,
            storage_temp_min_c: row.requires_cold_chain ? row.storage_temp_min_c ?? null : null,
            storage_temp_max_c: row.requires_cold_chain ? row.storage_temp_max_c ?? null : null,
            // Input VAT exists only on a supplier bill, and never on an exempt medicine.
            vat_amount: supplierId && row.is_taxable ? row.vat_amount || 0 : 0,
          })
        }

        payloadGroups.push({
          supplierId,
          supplierInvoiceNumber: group.supplierInvoiceNumber.trim() || null,
          receiptDate: normalizeCsvDate(group.receiptDate).ymd ?? todayYmd(),
          payment: supplierId ? toBillPaymentInput(group.payment) : null,
          rows,
        })
      }

      const result = await medicinesApi.bulkCreate(
        payloadGroups as any,
        importKeys.current.keyFor(JSON.stringify(payloadGroups)),
      )
      if (result.error || !result.data) {
        throw new Error(result.error || "Bulk import failed")
      }
      importKeys.current.reset()

      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      if (payloadGroups.some((g) => g.supplierId)) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      }

      const billCount = result.data.groups.filter((g) => g.supplierId).length
      // Rows naming a medicine that already exists add a batch to it rather than a duplicate.
      const merged = result.data.addedToExistingCount
      const newCount = result.data.createdMedicines.length - merged
      const summary = [
        `Added ${newCount} new medicine(s)`,
        merged > 0 && `${merged} row(s) added as new batches of existing medicines`,
        billCount > 0 && `across ${billCount} supplier bill(s)`,
      ]
        .filter(Boolean)
        .join(", ")
      toast({
        title: "Success",
        description: summary,
      })

      // Receipt details: one per bill, from the lines the server just accepted.
      setReceipt(
        receivedBills(
          nonEmptyGroups.map((group, gi) => {
            const sent = payloadGroups[gi]
            const added = result.data?.groups[gi]?.addedToExisting ?? []
            return {
              supplierName: sent.supplierId ? group.supplier.trim() : null,
              invoiceNumber: sent.supplierInvoiceNumber ?? null,
              receiptDate: sent.receiptDate,
              paymentNote: sent.supplierId ? supplierPaymentNote(group.payment) : null,
              lines: sent.rows.map((row, ri) => ({
                medicineName: row.name,
                batchNumber: row.batch_number,
                expiryDate: row.expiry_date,
                quantity: row.stock_quantity,
                unitCost: row.cost_price,
                sellingPrice: row.unit_price,
                vat: row.vat_amount ?? 0,
                addedToExisting: added[ri] ?? false,
              })),
            }
          }),
        ),
      )

      // Trigger data refresh events for other components
      window.dispatchEvent(new CustomEvent("refresh-medicines"))
      window.dispatchEvent(new CustomEvent("refresh-data"))

      onSuccess()
      handleClose()
    } catch (error: unknown) {
      toast({
        title: "Import failed",
        description: apiRequestErrorMessage(error) || "Nothing was saved — fix the issue and try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setGroups([])
    setCsvText("")
    setActiveTab("manual")
    onClose()
  }

  const downloadTemplate = () => {
    const template = `name,generic_name,strength,form,unit_price,cost_price,stock_quantity,minimum_stock,category,supplier,supplier_invoice_number,receipt_date,payment_status,payment_method,paid_amount,payment_reference,expiry_date,batch_number,rack_location,is_taxable,vat_amount,prescription_required,controlled_substance,units_per_pack,unit_label,price_per,cost_currency,selling_currency
Aspirin,Acetylsalicylic acid,100mg,Tablet,5.00,3.00,100,20,Analgesics,Supplier A,INV-1001,2026-10-01,paid,bank,,TXN-7781,2027-12-31,BATCH-001,Rack 3,false,,false,false,10,strip,unit,NPR,NPR
Paracetamol,Acetaminophen,500mg,Tablet,30.00,20.00,150,30,Analgesics,Supplier A,INV-1001,2026-10-01,paid,bank,,TXN-7781,2027-06-30,BATCH-002,Rack 3,false,,false,false,10,strip,strip,NPR,NPR
Ibuprofen,Ibuprofen,200mg,Tablet,25.00,25.00,80,20,Analgesics,Supplier B,B-552,2026-10-03,credit,,,,2027-09-15,BATCH-003,Fridge 2,true,26.00,false,false,10,strip,strip,NPR,INR`

    const blob = new Blob([template], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "medicine_import_template.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Bulk import medicines</DialogTitle>
          <DialogDescription>
            Group entries by supplier bill — every medicine under one bill posts as a single consolidated receipt.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "csv")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="csv">CSV Import</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>CSV Import</CardTitle>
                    <CardDescription>
                      Paste CSV data or upload a file. Rows sharing the same supplier + bill number are grouped into one receipt.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Upload a spreadsheet</p>
                    <p className="text-sm text-muted-foreground">CSV or Excel. The first row must be the column headers.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ""
                      if (file) void handleImportFile(file)
                    }}
                  />
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload file
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csv-data">Or paste CSV</Label>
                  <Textarea
                    id="csv-data"
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Paste CSV data here or use the template format..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <Button onClick={handleCSVParse} className="w-full min-h-11">
                  <FileText className="h-4 w-4 mr-2" />
                  Parse CSV
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3">
            <VatRateNotice vatRatePercent={vatRatePercent} isLoading={vatRateLoading} />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Bills to Import</h3>
                <p className="text-xs text-muted-foreground">
                  {totalRows} medicine(s) across {nonEmptyGroups.length} bill(s) • {totalValidRows} ready
                </p>
              </div>
              <Button onClick={addGroup} size="sm" variant="outline" className="gap-1.5" title={`Add Bill Group (${modKey}+G)`}>
                <Plus className="h-4 w-4" />
                Add Bill Group
                <kbd className="ml-1 hidden rounded border bg-muted px-1 font-mono text-[10px] font-normal text-muted-foreground sm:inline">
                  {modKey}+G
                </kbd>
              </Button>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {groups.map((group) => (
                <Card key={group.id} className={cn(group.groupError ? "border-destructive/50" : undefined)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                        <div className="space-y-1.5">
                          <Label htmlFor={`group-supplier-${group.id}`} className="text-xs">Supplier</Label>
                          <Popover
                            open={supplierOpen === group.id}
                            onOpenChange={(open) => setSupplierOpen(open ? group.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                id={`group-supplier-${group.id}`}
                                className="w-full justify-between font-normal"
                              >
                                <span className="truncate">{group.supplier || "No supplier"}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                              <Command>
                                <CommandInput
                                  placeholder="Search suppliers..."
                                  value={supplierSearch}
                                  onValueChange={setSupplierSearch}
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    {supplierSearch.trim() ? (
                                      supplierSearch.trim().length < 2 ? (
                                        <p className="px-3 py-2 text-left text-sm text-destructive" role="alert">
                                          Supplier name must be at least 2 characters
                                        </p>
                                      ) : (
                                        <button
                                          type="button"
                                          className="flex w-full min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                                          onClick={() => {
                                            const parsed = supplierNameSchema.safeParse(supplierSearch.trim())
                                            if (!parsed.success) {
                                              toast({
                                                title: "Invalid supplier name",
                                                description: parsed.error.issues[0]?.message || "Supplier name is invalid",
                                                variant: "destructive",
                                              })
                                              return
                                            }
                                            updateGroupField(group.id, "supplier", parsed.data)
                                            setSupplierSearch("")
                                            setSupplierOpen(null)
                                          }}
                                        >
                                          <Plus className="h-4 w-4" />
                                          Use "{supplierSearch.trim()}" as new supplier
                                        </button>
                                      )
                                    ) : (
                                      "No supplier found."
                                    )}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value=""
                                      onSelect={() => {
                                        updateGroupField(group.id, "supplier", "")
                                        setSupplierOpen(null)
                                      }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", !group.supplier ? "opacity-100" : "opacity-0")} />
                                      No supplier
                                    </CommandItem>
                                    {suppliers.map((supplier) => (
                                      <CommandItem
                                        key={supplier.id}
                                        value={supplier.name}
                                        onSelect={() => {
                                          updateGroupField(group.id, "supplier", supplier.name)
                                          setSupplierOpen(null)
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            group.supplier === supplier.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {supplier.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`group-bill-${group.id}`} className="text-xs">
                            Bill / invoice no.{group.supplier.trim() && <span className="text-destructive" aria-hidden> *</span>}
                          </Label>
                          <Input
                            id={`group-bill-${group.id}`}
                            aria-required={!!group.supplier.trim()}
                            value={group.supplierInvoiceNumber}
                            onChange={(e) => updateGroupField(group.id, "supplierInvoiceNumber", e.target.value)}
                            placeholder={group.supplier.trim() ? "Required" : "Optional"}
                            disabled={!group.supplier.trim()}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`receipt-date-${group.id}`} className="text-xs">Receipt date</Label>
                          <DatePicker
                            id={`receipt-date-${group.id}`}
                            value={group.receiptDate}
                            onChange={(value) => updateGroupField(group.id, "receiptDate", value)}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 mt-5 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeGroup(group.id)}
                        aria-label="Remove bill group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {group.supplier.trim() ? (
                      <BillPaymentFields
                        idPrefix={`group-${group.id}`}
                        value={group.payment}
                        onChange={(next) => updateGroupPayment(group.id, next)}
                        total={billTotal(group.rows)}
                        receiptDate={group.receiptDate}
                      />
                    ) : group.rows.length > 0 ? (
                      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                        Opening stock — no supplier bill. The stock value posts to Inventory against Owner&apos;s Equity; nothing is owed.
                      </p>
                    ) : null}

                    {group.groupError && (
                      <p className="text-xs text-destructive" role="alert">{group.groupError}</p>
                    )}

                    {group.rows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-6 text-center">
                        <p className="text-xs text-muted-foreground">No medicines in this bill yet.</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">SN</TableHead>
                              <TableHead>Medicine</TableHead>
                              <TableHead className="text-right">Cost</TableHead>
                              <TableHead className="text-right">Selling</TableHead>
                              <TableHead className="text-right">Margin</TableHead>
                              <TableHead className="text-right">Stock</TableHead>
                              <TableHead className="text-right">VAT</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.rows.map((row, index) => {
                              const isValid = (row.errors?.length ?? 0) === 0
                              const marginPct =
                                row.cost_price > 0 ? ((row.unit_price - row.cost_price) / row.cost_price) * 100 : null
                              return (
                                <TableRow key={row.id}>
                                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                                  <TableCell>
                                    <div className="font-medium">{row.name || "—"}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {row.strength || "—"} • {row.form || "—"}
                                      {row.batch_number ? ` • Batch ${row.batch_number}` : ""}
                                      {row.rack_location ? ` • ${row.rack_location}` : ""}
                                    </div>
                                  </TableCell>
                                  <TableCell className="tabular-nums text-right text-muted-foreground">
                                    <CurrencyDisplay amount={row.cost_price || 0} />
                                  </TableCell>
                                  <TableCell className="tabular-nums text-right">
                                    <CurrencyDisplay amount={row.unit_price || 0} />
                                  </TableCell>
                                  <TableCell className="tabular-nums text-right">
                                    {marginPct === null ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : (
                                      <span
                                        className={cn(
                                          "font-medium",
                                          marginPct > 0
                                            ? "text-success"
                                            : marginPct < 0
                                            ? "text-destructive"
                                            : "text-muted-foreground"
                                        )}
                                      >
                                        {marginPct > 0 ? "+" : ""}
                                        {marginPct.toFixed(1)}%
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="tabular-nums text-right">{row.stock_quantity ?? 0}</TableCell>
                                  <TableCell className="tabular-nums text-right">
                                    {!row.is_taxable ? (
                                      <span className="text-xs text-muted-foreground">Exempt</span>
                                    ) : (
                                      <span title={row.vat_edited ? "From the supplier bill" : `Auto at ${formatRate(vatRate)}`}>
                                        <CurrencyDisplay amount={row.vat_amount || 0} />
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {isValid ? (
                                      <Badge variant="secondary" className="gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Valid
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive" className="gap-1">
                                        <XCircle className="h-3 w-3" /> Fix needed
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => openEditRow(group.id, row)}
                                        aria-label={`Edit ${row.name || "medicine"}`}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={() => removeRow(group.id, row.id)}
                                        aria-label={`Remove ${row.name || "medicine"}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openAddRow(group.id)}
                      className="gap-1.5"
                      title={group.id === groups[groups.length - 1]?.id ? `Add Medicine (${modKey}+Enter)` : undefined}
                    >
                      <Plus className="h-4 w-4" />
                      Add Medicine
                      {group.id === groups[groups.length - 1]?.id && (
                        <kbd className="ml-1 hidden rounded border bg-muted px-1 font-mono text-[10px] font-normal text-muted-foreground sm:inline">
                          {modKey}+↵
                        </kbd>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {totalValidRows > 0 && (
              <span className="text-success">{totalValidRows} medicine(s) ready to import</span>
            )}
            {totalRows - totalValidRows > 0 && (
              <span className="text-destructive ml-2">{totalRows - totalValidRows} medicine(s) need fixes</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canImport} loading={isLoading} loadingText="Importing…">
              <Upload className="h-4 w-4" aria-hidden />
              Import <span className="num">{totalValidRows}</span> {totalValidRows === 1 ? "medicine" : "medicines"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Add/Edit row dialog — saving here only updates the local group above;
          the API call happens once, in bulk, when "Import" is clicked. */}
      <Dialog open={rowDialogOpen} onOpenChange={setRowDialogOpen}>
        {/* Scrolls: the row carries the whole medicine card now, taller than a short window. */}
        <DialogContent className={cn(DIALOG_CONTENT_DETAIL_CLASS, "sm:max-w-2xl")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              {editingRowId !== null ? "Edit Medicine" : "Add Medicine"}
              {activeGroupId && groups.find((g) => g.id === activeGroupId)?.supplier ? (
                <span className="text-sm font-normal text-muted-foreground">
                  — {groups.find((g) => g.id === activeGroupId)?.supplier}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {draftErrors.length > 0 && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {draftErrors.join(", ")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative space-y-1.5">
              <Label htmlFor="draft-name">Name <span className="text-destructive" aria-hidden>*</span></Label>
              <Input
                id="draft-name"
                aria-required
                value={draftRow.name}
                onChange={(e) => {
                  catalogSelectionRef.current = null
                  updateDraftField("name", e.target.value)
                }}
                onFocus={() => { if (catalogItems.length > 0) setCatalogOpen(true) }}
                placeholder="Search medicine directory or type a name"
                autoComplete="off"
              />
              {catalogOpen && (catalogLoading || catalogItems.length > 0) && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <Command>
                    <CommandList>
                      <CommandEmpty>
                        {catalogLoading ? "Loading..." : "No catalog matches found"}
                      </CommandEmpty>
                      <CommandGroup heading="Medicine directory">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-generic-name">Generic name</Label>
              <Input
                id="draft-generic-name"
                value={draftRow.generic_name || ""}
                onChange={(e) => updateDraftField("generic_name", e.target.value)}
                placeholder="Generic name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-brand-name">Brand name</Label>
              <Input
                id="draft-brand-name"
                value={draftRow.brand_name || ""}
                onChange={(e) => updateDraftField("brand_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-dosage">Dosage</Label>
              <Input
                id="draft-dosage"
                value={draftRow.dosage || ""}
                onChange={(e) => updateDraftField("dosage", e.target.value)}
                placeholder="e.g., 500mg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-form">Form <span className="text-destructive" aria-hidden>*</span></Label>
              <Select value={formOptionValue(draftRow.form) || undefined} onValueChange={(value) => updateDraftField("form", value)}>
                <SelectTrigger id="draft-form" aria-required className="w-full">
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent>
                  {MEDICINE_FORMS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                  {/* A form from a CSV or the directory that isn't in the list stays selectable as written. */}
                  {draftRow.form.trim() && !MEDICINE_FORMS.some((f) => f.value === formOptionValue(draftRow.form)) && (
                    <SelectItem value={draftRow.form.trim()}>{draftRow.form.trim()}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-strength">Strength</Label>
              <Input
                id="draft-strength"
                value={draftRow.strength}
                onChange={(e) => updateDraftField("strength", e.target.value)}
                placeholder="e.g., 10mg/ml"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-units-per-pack">Units per pack</Label>
              <Input
                id="draft-units-per-pack"
                type="number"
                min={1}
                value={draftRow.units_per_pack ?? ""}
                onChange={(e) => updateDraftField("units_per_pack", optionalNumber(e.target.value))}
                placeholder="e.g., 10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-unit-label">Unit label</Label>
              <Input
                id="draft-unit-label"
                value={draftRow.unit_label || ""}
                onChange={(e) => updateDraftField("unit_label", e.target.value)}
                placeholder="e.g., tablet, strip"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-packs-per-box">Strips per box</Label>
              <Input
                id="draft-packs-per-box"
                type="number"
                min={2}
                value={draftRow.packs_per_box ?? ""}
                onChange={(e) => updateDraftField("packs_per_box", optionalNumber(e.target.value))}
                disabled={draftRow.units_per_pack === undefined}
                placeholder="e.g., 10"
                aria-describedby="draft-packs-per-box-hint"
              />
              <p id="draft-packs-per-box-hint" className="text-xs text-muted-foreground">
                {boxSummary(draftRow.units_per_pack, draftRow.packs_per_box, draftRow.box_label, draftRow.unit_label, draftRow.form)
                  ?? "Optional. Set units per pack first; stock stays counted in single units."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-box-label">Box label</Label>
              <Input
                id="draft-box-label"
                value={draftRow.box_label || ""}
                onChange={(e) => updateDraftField("box_label", e.target.value)}
                disabled={draftRow.units_per_pack === undefined || draftRow.packs_per_box === undefined}
                placeholder="Box"
                maxLength={50}
              />
            </div>
            <div className="sm:col-span-2">
              <PriceEntryControls
                idPrefix="draft"
                value={draftPrice.entry}
                onChange={(entry) => updateDraftPrice({ ...draftPrice, entry })}
                units={formUnits(draftRow)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-cost-price">
                Cost price ({draftCostSuffix}) <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="draft-cost-price"
                  aria-required
                  type="number"
                  step="0.01"
                  value={draftPrice.cost}
                  onChange={(e) => updateDraftPrice({ ...draftPrice, cost: e.target.value })}
                  placeholder="0.00"
                />
                {allowInr && (
                  <PriceCurrencyToggle
                    label="Cost price currency"
                    value={draftPrice.entry.costCurrency}
                    onChange={(costCurrency) => updateDraftPrice({ ...draftPrice, entry: { ...draftPrice.entry, costCurrency } })}
                  />
                )}
              </div>
              {draftCostConverted && draftRow.cost_price > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saved as <CurrencyDisplay amount={draftRow.cost_price} /> per {draftBaseUnit}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-selling-price">
                Selling price / MRP ({draftSellingSuffix}) <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="draft-selling-price"
                  aria-required
                  type="number"
                  step="0.01"
                  value={draftPrice.selling}
                  onChange={(e) => updateDraftPrice({ ...draftPrice, selling: e.target.value })}
                  placeholder="0.00"
                />
                {allowInr && (
                  <PriceCurrencyToggle
                    label="Selling price currency"
                    value={draftPrice.entry.sellingCurrency}
                    onChange={(sellingCurrency) => updateDraftPrice({ ...draftPrice, entry: { ...draftPrice.entry, sellingCurrency } })}
                  />
                )}
              </div>
              {draftSellingConverted && draftRow.unit_price > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saved as <CurrencyDisplay amount={draftRow.unit_price} /> per {draftBaseUnit}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-stock-quantity">Stock quantity <span className="text-destructive" aria-hidden>*</span></Label>
              <Input
                id="draft-stock-quantity"
                aria-required
                type="number"
                min={1}
                value={draftRow.stock_quantity || ""}
                onChange={(e) => updateDraftField("stock_quantity", parseInt(e.target.value) || 0)}
                placeholder="Greater than 0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-minimum-stock">Minimum stock <span className="text-destructive" aria-hidden>*</span></Label>
              <Input
                id="draft-minimum-stock"
                aria-required
                type="number"
                value={draftRow.minimum_stock || ""}
                onChange={(e) => updateDraftField("minimum_stock", parseInt(e.target.value) || 10)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-maximum-stock">Maximum stock</Label>
              <Input
                id="draft-maximum-stock"
                type="number"
                min={0}
                value={draftRow.maximum_stock ?? ""}
                onChange={(e) => updateDraftField("maximum_stock", optionalNumber(e.target.value))}
                placeholder={String(draftRow.minimum_stock * 10)}
                aria-describedby="draft-maximum-stock-hint"
              />
              <p id="draft-maximum-stock-hint" className="text-xs text-muted-foreground">Blank = 10 × the minimum stock.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-expiry-date">
                Expiry date <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <DatePicker
                id="draft-expiry-date"
                presets={EXPIRY_PRESETS}
                allowFuture
                value={draftRow.expiry_date || ""}
                onChange={(value) => updateDraftField("expiry_date", value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-batch-number">Batch number</Label>
              <Input
                id="draft-batch-number"
                value={draftRow.batch_number || ""}
                onChange={(e) => updateDraftField("batch_number", e.target.value)}
                placeholder="e.g., BATCH-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-rack">Rack</Label>
              <Input
                id="draft-rack"
                value={draftRow.rack_location || ""}
                onChange={(e) => updateDraftField("rack_location", e.target.value)}
                placeholder="e.g. Rack 3"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-barcode">Barcode</Label>
              <Input
                id="draft-barcode"
                value={draftRow.barcode || ""}
                onChange={(e) => updateDraftField("barcode", e.target.value)}
                placeholder="Scan or type"
                maxLength={64}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="draft-line-vat">Input VAT (this line)</Label>
                {draftRow.vat_edited && draftRow.is_taxable && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setDraftRow((prev) => withResolvedVat({ ...prev, vat_edited: false }, vatRate))}
                  >
                    Use {formatRate(vatRate)}
                  </button>
                )}
              </div>
              <Input
                id="draft-line-vat"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="num"
                value={draftRow.is_taxable ? (draftRow.vat_amount ? String(draftRow.vat_amount) : "") : "0"}
                disabled={!draftRow.is_taxable}
                onChange={(e) => updateDraftField("vat_amount", parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                aria-describedby="draft-line-vat-hint"
              />
              <p id="draft-line-vat-hint" className="text-xs text-muted-foreground">
                {!draftRow.is_taxable
                  ? "VAT-exempt: no input VAT."
                  : draftRow.vat_edited
                    ? "Using the VAT on the supplier bill."
                    : vatRate > 0
                      ? `Auto: ${formatRate(vatRate)} of qty x cost. Edit if the bill differs. Not used for opening stock (no supplier).`
                      : "Enter the VAT shown on the supplier bill."}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="draft-category">Category</Label>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    id="draft-category"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between font-normal"
                  >
                    {draftRow.category || "Select or type category..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search categories..."
                      value={categorySearch}
                      onValueChange={setCategorySearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {categorySearch.trim() ? (
                          <button
                            type="button"
                            disabled={creatingCategory}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                            onClick={() => createCategoryInline(categorySearch)}
                          >
                            {creatingCategory ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                            Create category "{categorySearch.trim()}"
                          </button>
                        ) : (
                          "No category found."
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateDraftField("category", "")
                            setCategoryOpen(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", !draftRow.category ? "opacity-100" : "opacity-0")} />
                          None
                        </CommandItem>
                        {categories.map((category) => (
                          <CommandItem
                            key={category.id}
                            value={category.name}
                            onSelect={() => {
                              updateDraftField("category", category.name)
                              setCategoryOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", draftRow.category === category.name ? "opacity-100" : "opacity-0")} />
                            {category.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="draft-description">Description</Label>
              <Input
                id="draft-description"
                value={draftRow.description || ""}
                onChange={(e) => updateDraftField("description", e.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-side-effects">Side effects</Label>
              <Textarea
                id="draft-side-effects"
                rows={2}
                value={draftRow.side_effects || ""}
                onChange={(e) => updateDraftField("side_effects", e.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-storage-instructions">Storage instructions</Label>
              <Textarea
                id="draft-storage-instructions"
                rows={2}
                value={draftRow.storage_instructions || ""}
                onChange={(e) => updateDraftField("storage_instructions", e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                id="draft-prescription-required"
                checked={draftRow.prescription_required}
                onCheckedChange={(checked) => updateDraftField("prescription_required", checked)}
              />
              <Label htmlFor="draft-prescription-required">Prescription required</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="draft-controlled-substance"
                checked={draftRow.controlled_substance}
                onCheckedChange={(checked) => updateDraftField("controlled_substance", checked)}
              />
              <Label htmlFor="draft-controlled-substance">Controlled substance</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="draft-is-taxable"
                checked={draftRow.is_taxable}
                onCheckedChange={(checked) => updateDraftField("is_taxable", checked)}
              />
              <Label htmlFor="draft-is-taxable">Taxable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="draft-requires-cold-chain"
                checked={draftRow.requires_cold_chain ?? false}
                onCheckedChange={(checked) => updateDraftField("requires_cold_chain", checked)}
              />
              <Label htmlFor="draft-requires-cold-chain">Needs cold chain</Label>
            </div>
          </div>

          {draftRow.requires_cold_chain && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="draft-temp-min">Min temp (°C)</Label>
                <Input
                  id="draft-temp-min"
                  type="number"
                  step="0.1"
                  value={draftRow.storage_temp_min_c ?? ""}
                  onChange={(e) => updateDraftField("storage_temp_min_c", optionalNumber(e.target.value))}
                  placeholder="e.g., 2"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-temp-max">Max temp (°C)</Label>
                <Input
                  id="draft-temp-max"
                  type="number"
                  step="0.1"
                  value={draftRow.storage_temp_max_c ?? ""}
                  onChange={(e) => updateDraftField("storage_temp_max_c", optionalNumber(e.target.value))}
                  placeholder="e.g., 8"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="hidden text-xs text-muted-foreground sm:block">
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{modKey}+↵</kbd> save ·{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{modKey}+Shift+↵</kbd> save &amp; add another
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setRowDialogOpen(false)}>
                Cancel
              </Button>
              {editingRowId === null && (
                <Button type="button" variant="secondary" onClick={() => saveDraftRow(true)}>
                  Save &amp; Add Another
                </Button>
              )}
              <Button type="button" onClick={() => saveDraftRow(false)}>
                {editingRowId !== null ? "Save Changes" : "Add to List"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmNewSupplierDialog
        open={pendingNewSuppliers !== null}
        supplierNames={pendingNewSuppliers ?? []}
        confirming={isLoading}
        onOpenChange={(open) => {
          if (!open) setPendingNewSuppliers(null)
        }}
        onConfirm={() => {
          allowNewSuppliersRef.current = true
          setPendingNewSuppliers(null)
          void handleSubmit()
        }}
      />
    </Dialog>
    <StockReceiptSummaryDialog bills={receipt} onClose={() => setReceipt(null)} />
    </>
  )
}
