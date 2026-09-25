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
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { nepalMedicineCatalogApi, NepalMedicineCatalogItem } from "@/features/medicines/api-client-nepal-catalog"
import { CurrencyDisplay } from "@/components/currency-display"
import { supplierNameSchema } from "@/lib/utils/validation"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DualDateInput } from "@/components/ui/dual-date-input"

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
  vat_amount?: number
  expiry_date?: string
  batch_number?: string
  rack_location?: string
  is_taxable: boolean
  prescription_required: boolean
  controlled_substance: boolean
  errors?: string[]
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
  rows: MedicineRow[]
  groupError?: string | null
}

const todayYmd = () => new Date().toISOString().slice(0, 10)

function validateRow(row: MedicineRow): string[] {
  const errors: string[] = []
  if (!row.name || row.name.trim().length < 2) errors.push("Name is required (min 2 characters)")
  if (!row.form || row.form.trim().length < 1) errors.push("Form is required")
  if (row.unit_price <= 0) errors.push("Unit price must be greater than 0")
  if (row.cost_price <= 0) errors.push("Cost price must be greater than 0")
  if (row.stock_quantity <= 0) errors.push("Stock quantity must be greater than 0")
  if (row.minimum_stock < 0) errors.push("Minimum stock cannot be negative")
  if (!row.expiry_date || isNaN(Date.parse(row.expiry_date))) errors.push("Expiry date is required")
  return errors
}

/** Empty groups (no rows yet) are never an error — they're just excluded from
 *  submit. Only a non-empty group with a supplier but no bill number is a real
 *  problem, since the server requires a bill number to post a consolidated receipt. */
function validateGroup(group: BillGroup): string | null {
  if (group.rows.length === 0) return null
  if (group.supplier.trim() && !group.supplierInvoiceNumber.trim()) {
    return "Bill/invoice number is required when a supplier is set"
  }
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
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const emptyGroup = (): BillGroup => ({
    id: crypto.randomUUID(),
    supplier: initialSupplierName || "",
    supplierInvoiceNumber: "",
    receiptDate: todayYmd(),
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
    expiry_date: "",
    batch_number: "",
    rack_location: "",
    is_taxable: true,
    prescription_required: false,
    controlled_substance: false,
  })
  const [rowDialogOpen, setRowDialogOpen] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [draftRow, setDraftRow] = useState<MedicineRow>(emptyDraftRow())
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
        suppliersApi.getSuppliers(),
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
      form: item.form || prev.form,
      unit_price: item.unit_price ?? prev.unit_price,
      cost_price: item.cost_price ?? prev.cost_price,
      category: item.category_name || prev.category,
      prescription_required: item.prescription_required ?? prev.prescription_required,
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
  const parseCSV = (text: string): BillGroup[] => {
    const lines = text.trim().split("\n")
    if (lines.length < 2) return []

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
    const parsedGroups = new Map<string, BillGroup>()

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim())
      if (values.length < headers.length) continue

      const raw: any = {}
      headers.forEach((header, index) => {
        raw[header] = values[index] || ""
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
          receiptDate: raw.receipt_date || raw["receipt date"] || todayYmd(),
          rows: [],
        })
      }

      parsedGroups.get(groupKey)!.rows.push({
        id: crypto.randomUUID(),
        name: raw.name || "",
        generic_name: raw.generic_name || raw["generic name"] || "",
        strength: raw.strength || "",
        form: raw.form || "",
        unit_price: parseFloat(raw.unit_price || raw["unit price"] || "0"),
        cost_price: parseFloat(raw.cost_price || raw["cost price"] || "0"),
        stock_quantity: parseInt(raw.stock_quantity || raw["stock quantity"] || "0"),
        minimum_stock: parseInt(raw.minimum_stock || raw["minimum stock"] || "10"),
        category: raw.category || "",
        vat_amount: parseFloat(raw.vat_amount || raw["vat amount"] || "0"),
        expiry_date: raw.expiry_date || raw["expiry date"] || "",
        batch_number: raw.batch_number || raw["batch number"] || "",
        rack_location: raw.rack_location || raw.rack || raw["rack location"] || "",
        is_taxable: (raw.is_taxable || raw["is taxable"] || raw["taxable"] || "true").toLowerCase() !== "false",
        prescription_required: (raw.prescription_required || raw["prescription required"] || "false").toLowerCase() === "true",
        controlled_substance: (raw.controlled_substance || raw["controlled substance"] || "false").toLowerCase() === "true",
      })
    }

    return [...parsedGroups.values()]
  }

  const handleCSVParse = () => {
    if (!csvText.trim()) {
      toast({ title: "Error", description: "Please enter CSV data", variant: "destructive" })
      return
    }

    const parsed = parseCSV(csvText)
    if (parsed.length === 0) {
      toast({ title: "Error", description: "No valid data found in CSV", variant: "destructive" })
      return
    }

    const validated = revalidate(parsed)
    setGroups(validated)
    setActiveTab("manual")

    const totalRows = validated.reduce((sum, g) => sum + g.rows.length, 0)
    toast({
      title: "CSV Parsed",
      description: `Found ${totalRows} medicine(s) across ${validated.length} bill(s). Review below before importing.`,
    })
  }

  const openAddRow = (groupId: string) => {
    setActiveGroupId(groupId)
    setEditingRowId(null)
    setDraftRow(emptyDraftRow())
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
    setDraftErrors([])
    catalogSelectionRef.current = null
    setCatalogOpen(false)
    setCatalogItems([])
    setCategorySearch("")
    setRowDialogOpen(true)
  }

  const updateDraftField = (field: keyof MedicineRow, value: any) => {
    setDraftRow((prev) => ({ ...prev, [field]: value }))
  }

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
      const supplierResult = await suppliersApi.getSuppliers()
      if (categoryResult.error) throw new Error(categoryResult.error)
      if (supplierResult.error) throw new Error(supplierResult.error)

      const categoryMap = new Map(categoryResult.data.map((c) => [c.name.toLowerCase(), c.id]))
      const supplierMap = new Map(supplierResult.data.map((s) => [s.name.toLowerCase(), s.id]))

      const payloadGroups: Array<{
        supplierId: string | null
        supplierInvoiceNumber?: string | null
        receiptDate: string
        rows: any[]
      }> = []

      for (const group of nonEmptyGroups) {
        let supplierId: string | null = null
        const supName = group.supplier.trim().toLowerCase()
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
            brand_name: null,
            strength: row.strength.trim(),
            form: row.form.trim(),
            unit_price: row.unit_price,
            cost_price: row.cost_price,
            stock_quantity: row.stock_quantity,
            minimum_stock: row.minimum_stock,
            maximum_stock: row.minimum_stock * 10,
            expiry_date: row.expiry_date?.trim() || null,
            batch_number: row.batch_number?.trim() || null,
            rack_location: row.rack_location?.trim() || null,
            is_taxable: row.is_taxable,
            category_id: categoryId,
            description: null,
            controlled_substance: row.controlled_substance,
            prescription_required: row.prescription_required,
            dosage: null,
            side_effects: null,
            storage_instructions: null,
            barcode: null,
            vat_amount: row.vat_amount || 0,
          })
        }

        payloadGroups.push({
          supplierId,
          supplierInvoiceNumber: group.supplierInvoiceNumber.trim() || null,
          receiptDate: group.receiptDate,
          rows,
        })
      }

      const result = await medicinesApi.bulkCreate(payloadGroups as any)
      if (result.error || !result.data) {
        throw new Error(result.error || "Bulk import failed")
      }

      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      if (payloadGroups.some((g) => g.supplierId)) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      }

      const billCount = result.data.groups.filter((g) => g.supplierId).length
      toast({
        title: "Success",
        description:
          billCount > 0
            ? `Added ${result.data.createdMedicines.length} medicine(s) across ${billCount} supplier bill(s)`
            : `Added ${result.data.createdMedicines.length} medicine(s)`,
      })

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
    const template = `name,generic_name,strength,form,unit_price,cost_price,stock_quantity,minimum_stock,category,supplier,supplier_invoice_number,expiry_date,batch_number,rack_location,is_taxable,prescription_required,controlled_substance
Aspirin,Acetylsalicylic acid,100mg,Tablet,5.00,3.00,100,20,Analgesics,Supplier A,INV-1001,2027-12-31,BATCH-001,Rack 3,true,false,false
Paracetamol,Acetaminophen,500mg,Tablet,3.00,2.00,150,30,Analgesics,Supplier A,INV-1001,2027-06-30,BATCH-002,Rack 3,true,false,false
Ibuprofen,Ibuprofen,200mg,Tablet,4.00,2.50,80,20,Analgesics,Supplier B,B-552,2027-09-15,BATCH-003,Fridge 2,true,false,false`

    const blob = new Blob([template], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "medicine_import_template.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Bulk Import Medicines</DialogTitle>
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
                <div className="space-y-2">
                  <Label>CSV Data</Label>
                  <Textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Paste CSV data here or use the template format..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <Button onClick={handleCSVParse} className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Parse CSV
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3">
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
                          <Label className="text-xs">Supplier</Label>
                          <Popover
                            open={supplierOpen === group.id}
                            onOpenChange={(open) => setSupplierOpen(open ? group.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between font-normal"
                              >
                                <span className="truncate">{group.supplier || "No supplier"}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
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
                          <Label className="text-xs">
                            Bill / Invoice No. {group.supplier.trim() && <span className="text-destructive">*</span>}
                          </Label>
                          <Input
                            value={group.supplierInvoiceNumber}
                            onChange={(e) => updateGroupField(group.id, "supplierInvoiceNumber", e.target.value)}
                            placeholder={group.supplier.trim() ? "Required" : "Optional"}
                            disabled={!group.supplier.trim()}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Receipt Date</Label>
                          <Input
                            type="date"
                            value={group.receiptDate}
                            onChange={(e) => updateGroupField(group.id, "receiptDate", e.target.value)}
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

                    {group.groupError && (
                      <p className="text-xs text-destructive">{group.groupError}</p>
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
                                            ? "text-green-600 dark:text-green-500"
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
              <span className="text-green-600">{totalValidRows} medicine(s) ready to import</span>
            )}
            {totalRows - totalValidRows > 0 && (
              <span className="text-destructive ml-2">{totalRows - totalValidRows} medicine(s) need fixes</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || !canImport}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {totalValidRows} Medicine(s)
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Add/Edit row dialog — saving here only updates the local group above;
          the API call happens once, in bulk, when "Import" is clicked. */}
      <Dialog open={rowDialogOpen} onOpenChange={setRowDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
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
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {draftErrors.join(", ")}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 relative">
              <Label>Name *</Label>
              <Input
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
              <Label>Generic Name</Label>
              <Input
                value={draftRow.generic_name || ""}
                onChange={(e) => updateDraftField("generic_name", e.target.value)}
                placeholder="Generic name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Strength</Label>
              <Input
                value={draftRow.strength}
                onChange={(e) => updateDraftField("strength", e.target.value)}
                placeholder="e.g., 100mg"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Form *</Label>
              <Input
                value={draftRow.form}
                onChange={(e) => updateDraftField("form", e.target.value)}
                placeholder="e.g., Tablet"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Selling Price *</Label>
              <Input
                type="number"
                step="0.01"
                value={draftRow.unit_price || ""}
                onChange={(e) => updateDraftField("unit_price", parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cost Price *</Label>
              <Input
                type="number"
                step="0.01"
                value={draftRow.cost_price || ""}
                onChange={(e) => updateDraftField("cost_price", parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stock Quantity *</Label>
              <Input
                type="number"
                min={1}
                value={draftRow.stock_quantity || ""}
                onChange={(e) => updateDraftField("stock_quantity", parseInt(e.target.value) || 0)}
                placeholder="Greater than 0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum Stock *</Label>
              <Input
                type="number"
                value={draftRow.minimum_stock || ""}
                onChange={(e) => updateDraftField("minimum_stock", parseInt(e.target.value) || 10)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date *</Label>
              <DualDateInput
                value={draftRow.expiry_date || ""}
                onChange={(value) => updateDraftField("expiry_date", value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Batch Number</Label>
              <Input
                value={draftRow.batch_number || ""}
                onChange={(e) => updateDraftField("batch_number", e.target.value)}
                placeholder="e.g., BATCH-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rack</Label>
              <Input
                value={draftRow.rack_location || ""}
                onChange={(e) => updateDraftField("rack_location", e.target.value)}
                placeholder="e.g. Rack 3"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Line VAT</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={draftRow.vat_amount || ""}
                onChange={(e) => updateDraftField("vat_amount", parseFloat(e.target.value) || 0)}
                placeholder="0"
                title="Recoverable VAT on this line of the bill (optional)"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Category</Label>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between font-normal"
                  >
                    {draftRow.category || "Select or type category..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
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
          </div>

          <div className="flex items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                checked={draftRow.prescription_required}
                onCheckedChange={(checked) => updateDraftField("prescription_required", checked)}
              />
              <Label>Prescription Required</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draftRow.controlled_substance}
                onCheckedChange={(checked) => updateDraftField("controlled_substance", checked)}
              />
              <Label>Controlled Substance</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draftRow.is_taxable}
                onCheckedChange={(checked) => updateDraftField("is_taxable", checked)}
              />
              <Label>Taxable</Label>
            </div>
          </div>

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
    </Dialog>
  )
}
