"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Download, Plus, Pencil, Trash2, Check, ChevronsUpDown } from "lucide-react"
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
import { DualDateInput } from "@/components/ui/dual-date-input"

interface BulkMedicineImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** When opened from a supplier's page, pre-fills every row's supplier (manual rows
   *  default to it; CSV rows keep their own "supplier" column if one is present). */
  initialSupplierName?: string
}

interface MedicineRow {
  name: string
  generic_name?: string
  strength: string
  form: string
  unit_price: number
  cost_price: number
  stock_quantity: number
  minimum_stock: number
  category?: string
  supplier?: string
  supplier_invoice_number?: string
  expiry_date?: string
  prescription_required: boolean
  controlled_substance: boolean
  rowNumber: number
  errors?: string[]
}

export default function BulkMedicineImportModal({
  isOpen,
  onClose,
  onSuccess,
  initialSupplierName,
}: BulkMedicineImportModalProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"manual" | "csv">("manual")
  const [csvText, setCsvText] = useState("")
  const [medicines, setMedicines] = useState<MedicineRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [validationResults, setValidationResults] = useState<{ valid: MedicineRow[]; invalid: MedicineRow[] }>({ valid: [], invalid: [] })
  const { toast } = useToast()

  // Row add/edit dialog: "Add Medicine" opens this with a blank draft; editing a
  // table row opens it pre-filled. Saving pushes/updates the row in `medicines`
  // (the table below), it does not hit the API — the whole batch is created by
  // handleSubmit at the end.
  const emptyDraftRow: MedicineRow = {
    name: "",
    generic_name: "",
    strength: "",
    form: "",
    unit_price: 0,
    cost_price: 0,
    stock_quantity: 0,
    minimum_stock: 10,
    category: "",
    supplier: initialSupplierName || "",
    supplier_invoice_number: "",
    expiry_date: "",
    prescription_required: false,
    controlled_substance: false,
    rowNumber: 0,
  }
  const [rowDialogOpen, setRowDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draftRow, setDraftRow] = useState<MedicineRow>(emptyDraftRow)
  const [draftErrors, setDraftErrors] = useState<string[]>([])

  // Existing categories/suppliers, fetched once the modal opens, so the row
  // form can offer a searchable pick-from-directory experience instead of
  // free-typed text that silently creates duplicates.
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState("")

  // Medicine-name catalog search for the row dialog, mirroring the same
  // lookup used on the single "Add Medicine" form.
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogItems, setCatalogItems] = useState<NepalMedicineCatalogItem[]>([])

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
    if (!rowDialogOpen || keyword.length < 2) {
      setCatalogItems([])
      return
    }

    const timeout = setTimeout(async () => {
      try {
        setCatalogLoading(true)
        const data = await nepalMedicineCatalogApi.search(keyword, 12)
        setCatalogItems(data)
        setCatalogOpen(true)
      } catch {
        setCatalogItems([])
      } finally {
        setCatalogLoading(false)
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [draftRow.name, rowDialogOpen])

  const applyCatalogSuggestion = (item: NepalMedicineCatalogItem) => {
    setDraftRow((prev) => ({
      ...prev,
      name: item.brand_name || prev.name,
      generic_name: item.generic_name || prev.generic_name,
      strength: item.strength || prev.strength,
      form: item.form || prev.form,
      unit_price: item.unit_price ?? prev.unit_price,
      cost_price: item.cost_price ?? prev.cost_price,
      category: item.category_name || prev.category,
      prescription_required: item.prescription_required ?? prev.prescription_required,
    }))
    setCatalogOpen(false)
  }

  const parseCSV = (text: string): MedicineRow[] => {
    const lines = text.trim().split("\n")
    if (lines.length < 2) return []

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase())
    const rows: MedicineRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim())
      if (values.length < headers.length) continue

      const row: any = { rowNumber: i + 1 }
      headers.forEach((header, index) => {
        row[header] = values[index] || ""
      })

      rows.push({
        name: row.name || "",
        generic_name: row.generic_name || row["generic name"] || "",
        strength: row.strength || "",
        form: row.form || "",
        unit_price: parseFloat(row.unit_price || row["unit price"] || "0"),
        cost_price: parseFloat(row.cost_price || row["cost price"] || "0"),
        stock_quantity: parseInt(row.stock_quantity || row["stock quantity"] || "0"),
        minimum_stock: parseInt(row.minimum_stock || row["minimum stock"] || "10"),
        category: row.category || "",
        supplier: row.supplier || initialSupplierName || "",
        supplier_invoice_number: row.supplier_invoice_number || row["supplier invoice number"] || row["invoice number"] || row.invoice_number || "",
        expiry_date: row.expiry_date || row["expiry date"] || "",
        prescription_required: (row.prescription_required || row["prescription required"] || "false").toLowerCase() === "true",
        controlled_substance: (row.controlled_substance || row["controlled substance"] || "false").toLowerCase() === "true",
        rowNumber: i + 1,
      })
    }

    return rows
  }

  const validateMedicines = (meds: MedicineRow[]): { valid: MedicineRow[]; invalid: MedicineRow[] } => {
    const valid: MedicineRow[] = []
    const invalid: MedicineRow[] = []

    meds.forEach(med => {
      const errors: string[] = []
      
      if (!med.name || med.name.trim().length < 2) {
        errors.push("Name is required (min 2 characters)")
      }
      if (!med.strength || med.strength.trim().length < 1) {
        errors.push("Strength is required")
      }
      if (!med.form || med.form.trim().length < 1) {
        errors.push("Form is required")
      }
      if (med.unit_price <= 0) {
        errors.push("Unit price must be greater than 0")
      }
      if (med.cost_price <= 0) {
        errors.push("Cost price must be greater than 0")
      }
      if (med.stock_quantity < 0) {
        errors.push("Stock quantity cannot be negative")
      }
      if (med.minimum_stock < 0) {
        errors.push("Minimum stock cannot be negative")
      }
      if (!med.expiry_date || isNaN(Date.parse(med.expiry_date))) {
        errors.push("Expiry date is required")
      }

      if (errors.length > 0) {
        invalid.push({ ...med, errors })
      } else {
        valid.push(med)
      }
    })

    return { valid, invalid }
  }

  const handleCSVParse = () => {
    if (!csvText.trim()) {
      toast({
        title: "Error",
        description: "Please enter CSV data",
        variant: "destructive",
      })
      return
    }

    const parsed = parseCSV(csvText)
    if (parsed.length === 0) {
      toast({
        title: "Error",
        description: "No valid data found in CSV",
        variant: "destructive",
      })
      return
    }

    setMedicines(parsed)
    const validation = validateMedicines(parsed)
    setValidationResults(validation)

    toast({
      title: "CSV Parsed",
      description: `Found ${parsed.length} medicines. ${validation.valid.length} valid, ${validation.invalid.length} with errors.`,
    })
  }

  const openAddRow = () => {
    setEditingIndex(null)
    setDraftRow({ ...emptyDraftRow })
    setDraftErrors([])
    setCatalogOpen(false)
    setCatalogItems([])
    setCategorySearch("")
    setSupplierSearch("")
    setRowDialogOpen(true)
  }

  const openEditRow = (index: number) => {
    setEditingIndex(index)
    setDraftRow({ ...medicines[index] })
    setDraftErrors([])
    setCatalogOpen(false)
    setCatalogItems([])
    setCategorySearch("")
    setSupplierSearch("")
    setRowDialogOpen(true)
  }

  const updateDraftField = (field: keyof MedicineRow, value: any) => {
    setDraftRow((prev) => ({ ...prev, [field]: value }))
  }

  const saveDraftRow = () => {
    const { invalid } = validateMedicines([draftRow])
    if (invalid.length > 0) {
      setDraftErrors(invalid[0].errors || [])
      return
    }

    let updated: MedicineRow[]
    if (editingIndex !== null) {
      updated = [...medicines]
      updated[editingIndex] = { ...draftRow, rowNumber: updated[editingIndex].rowNumber }
    } else {
      updated = [...medicines, { ...draftRow, rowNumber: medicines.length + 1 }]
    }
    setMedicines(updated)
    setValidationResults(validateMedicines(updated))
    setRowDialogOpen(false)
  }

  const handleRemoveMedicine = (index: number) => {
    const updated = medicines.filter((_, i) => i !== index)
    setMedicines(updated)
    
    // Re-validate
    const validation = validateMedicines(updated)
    setValidationResults(validation)
  }

  const handleSubmit = async () => {
    if (validationResults.valid.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one valid medicine",
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

      let successCount = 0
      const errors: string[] = []

      for (const med of validationResults.valid) {
        try {
          const catName = med.category?.trim().toLowerCase()
          const supName = med.supplier?.trim().toLowerCase()

          let categoryId: string | null = null
          if (catName) {
            const existing = categoryMap.get(catName)
            if (existing) categoryId = existing
            else {
              const created = await categoriesApi.createCategory(med.category!.trim())
              if (created.error || !created.data) throw new Error(created.error || "Failed to create category")
              categoryId = created.data.id
              categoryMap.set(catName, created.data.id)
            }
          }

          let supplierId: string | null = null
          if (supName) {
            const existing = supplierMap.get(supName)
            if (existing) supplierId = existing
            else {
              const created = await suppliersApi.createSupplier({ name: med.supplier!.trim() })
              if (created.error || !created.data) throw new Error(created.error || "Failed to create supplier")
              supplierId = created.data.id
              supplierMap.set(supName, created.data.id)
            }
          }

          const payload = {
            name: med.name.trim(),
            generic_name: med.generic_name?.trim() || null,
            brand_name: null,
            strength: med.strength.trim(),
            form: med.form.trim(),
            unit_price: med.unit_price,
            cost_price: med.cost_price,
            stock_quantity: med.stock_quantity,
            minimum_stock: med.minimum_stock,
            maximum_stock: med.minimum_stock * 10,
            expiry_date: med.expiry_date?.trim() || null,
            category_id: categoryId,
            supplier_id: supplierId,
            supplier_invoice_number: med.supplier_invoice_number?.trim() || null,
            description: null,
            controlled_substance: med.controlled_substance,
            prescription_required: med.prescription_required,
            dosage: null,
            side_effects: null,
            storage_instructions: null,
            barcode: null,
          }

          const created = await medicinesApi.createMedicine(payload)
          if (created.error || !created.data) throw new Error(created.error || "Failed to create medicine")
          successCount += 1
        } catch (err) {
          errors.push(`Row ${med.rowNumber} (${med.name}): ${err instanceof Error ? err.message : "Failed"}`)
        }
      }

      // Invalidate medicine queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      if (validationResults.valid.some((med) => med.supplier?.trim())) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      }

      if (errors.length > 0) {
        toast({
          title: "Import completed with issues",
          description: `Added ${successCount} medicines, ${errors.length} failed. Check console for details.`,
          variant: "destructive",
        })
        console.error("Bulk import errors:", errors)
      } else {
        toast({
          title: "Success",
          description: `Successfully added ${successCount} medicines`,
        })
      }

      // Trigger data refresh events for other components
      window.dispatchEvent(new CustomEvent("refresh-medicines"))
      window.dispatchEvent(new CustomEvent("refresh-data"))

      onSuccess()
      handleClose()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add medicines",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setMedicines([])
    setCsvText("")
    setValidationResults({ valid: [], invalid: [] })
    setActiveTab("manual")
    onClose()
  }

  const downloadTemplate = () => {
    const template = `name,generic_name,strength,form,unit_price,cost_price,stock_quantity,minimum_stock,category,supplier,supplier_invoice_number,expiry_date,prescription_required,controlled_substance
Aspirin,Acetylsalicylic acid,100mg,Tablet,5.00,3.00,100,20,Analgesics,Supplier A,INV-1001,2027-12-31,false,false
Paracetamol,Acetaminophen,500mg,Tablet,3.00,2.00,150,30,Analgesics,Supplier B,INV-1002,2027-06-30,false,false`
    
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
            Add multiple medicines at once using manual entry or CSV import
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
                    <CardDescription>Paste CSV data or upload a file</CardDescription>
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
                <h3 className="text-sm font-semibold">Medicines to Add</h3>
                <p className="text-xs text-muted-foreground">
                  {medicines.length} medicine(s) • {validationResults.valid.length} valid • {validationResults.invalid.length} with errors
                </p>
              </div>
              <Button onClick={openAddRow} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Medicine
              </Button>
            </div>

            {medicines.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <p className="text-sm text-muted-foreground">No medicines added yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">Click "Add Medicine" to open the form.</p>
              </div>
            ) : (
              <div className="rounded-lg border max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {medicines.map((med, index) => {
                      const isValid = validationResults.valid.some((m) => m.rowNumber === med.rowNumber)
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="font-medium">{med.name || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {med.strength || "—"} • {med.form || "—"}
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            <CurrencyDisplay amount={med.unit_price || 0} />
                          </TableCell>
                          <TableCell className="tabular-nums">{med.stock_quantity ?? 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {med.supplier || "—"}
                            {med.supplier_invoice_number ? (
                              <div className="text-xs">Bill: {med.supplier_invoice_number}</div>
                            ) : null}
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
                                onClick={() => openEditRow(index)}
                                aria-label={`Edit ${med.name || "medicine"}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveMedicine(index)}
                                aria-label={`Remove ${med.name || "medicine"}`}
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
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {validationResults.valid.length > 0 && (
              <span className="text-green-600">{validationResults.valid.length} valid medicine(s) ready to import</span>
            )}
            {validationResults.invalid.length > 0 && (
              <span className="text-destructive ml-2">{validationResults.invalid.length} medicine(s) need fixes</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || validationResults.valid.length === 0}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {validationResults.valid.length} Medicine(s)
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Add/Edit row dialog — saving here only updates the local table above;
          the API call happens once, in bulk, when "Import" is clicked. */}
      <Dialog open={rowDialogOpen} onOpenChange={setRowDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingIndex !== null ? "Edit Medicine" : "Add Medicine"}</DialogTitle>
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
                onChange={(e) => updateDraftField("name", e.target.value)}
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
              <Label>Strength *</Label>
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
              <Label>Unit Price *</Label>
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
                value={draftRow.stock_quantity || ""}
                onChange={(e) => updateDraftField("stock_quantity", parseInt(e.target.value) || 0)}
                placeholder="0"
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
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              updateDraftField("category", categorySearch.trim())
                              setCategoryOpen(false)
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Use "{categorySearch.trim()}" as new category
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
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className="w-full justify-between font-normal"
                  >
                    {draftRow.supplier || "Select or type supplier..."}
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
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              updateDraftField("supplier", supplierSearch.trim())
                              setSupplierOpen(false)
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Use "{supplierSearch.trim()}" as new supplier
                          </button>
                        ) : (
                          "No supplier found."
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateDraftField("supplier", "")
                            setSupplierOpen(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", !draftRow.supplier ? "opacity-100" : "opacity-0")} />
                          None
                        </CommandItem>
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            value={supplier.name}
                            onSelect={() => {
                              updateDraftField("supplier", supplier.name)
                              setSupplierOpen(false)
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", draftRow.supplier === supplier.name ? "opacity-100" : "opacity-0")} />
                            {supplier.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {draftRow.supplier?.trim() && (
            <div className="space-y-1.5">
              <Label>Supplier Bill / Invoice No.</Label>
              <Input
                value={draftRow.supplier_invoice_number || ""}
                onChange={(e) => updateDraftField("supplier_invoice_number", e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}

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
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRowDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveDraftRow}>
              {editingIndex !== null ? "Save Changes" : "Add to List"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

