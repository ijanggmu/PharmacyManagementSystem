"use client"

import type React from "react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/lib/hooks/use-medicines"

interface BulkMedicineImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
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
  prescription_required: boolean
  controlled_substance: boolean
  rowNumber: number
  errors?: string[]
}

export default function BulkMedicineImportModal({ isOpen, onClose, onSuccess }: BulkMedicineImportModalProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"manual" | "csv">("manual")
  const [csvText, setCsvText] = useState("")
  const [medicines, setMedicines] = useState<MedicineRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [validationResults, setValidationResults] = useState<{ valid: MedicineRow[]; invalid: MedicineRow[] }>({ valid: [], invalid: [] })
  const { toast } = useToast()

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
        supplier: row.supplier || "",
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

  const handleAddManual = () => {
    const newMedicine: MedicineRow = {
      name: "",
      strength: "",
      form: "",
      unit_price: 0,
      cost_price: 0,
      stock_quantity: 0,
      minimum_stock: 10,
      prescription_required: false,
      controlled_substance: false,
      rowNumber: medicines.length + 1,
    }
    setMedicines([...medicines, newMedicine])
  }

  const handleUpdateMedicine = (index: number, field: keyof MedicineRow, value: any) => {
    const updated = [...medicines]
    updated[index] = { ...updated[index], [field]: value }
    setMedicines(updated)
    
    // Re-validate
    const validation = validateMedicines(updated)
    setValidationResults(validation)
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
      const supabase = createClient()
      const { data: categories } = await supabase.from("categories").select("id, name")
      const { data: suppliers } = await supabase.from("suppliers").select("id, name")

      const medicinesToInsert = validationResults.valid.map(med => {
        const categoryId = categories?.find((c: { id: string; name: string }) => c.name.toLowerCase() === med.category?.toLowerCase())?.id
        const supplierId = suppliers?.find((s: { id: string; name: string }) => s.name.toLowerCase() === med.supplier?.toLowerCase())?.id

        return {
          name: med.name.trim(),
          generic_name: med.generic_name?.trim() || null,
          strength: med.strength.trim(),
          form: med.form.trim(),
          unit_price: med.unit_price,
          cost_price: med.cost_price,
          stock_quantity: med.stock_quantity,
          minimum_stock: med.minimum_stock,
          maximum_stock: med.minimum_stock * 10,
          category_id: categoryId || null,
          supplier_id: supplierId || null,
          prescription_required: med.prescription_required,
          controlled_substance: med.controlled_substance,
        }
      })

      const { error } = await supabase.from("medicines").insert(medicinesToInsert)

      if (error) {
        throw error
      }

      // Invalidate medicine queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })

      toast({
        title: "Success",
        description: `Successfully added ${medicinesToInsert.length} medicines`,
      })

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
    const template = `name,generic_name,strength,form,unit_price,cost_price,stock_quantity,minimum_stock,category,supplier,prescription_required,controlled_substance
Aspirin,Acetylsalicylic acid,100mg,Tablet,5.00,3.00,100,20,Analgesics,Supplier A,false,false
Paracetamol,Acetaminophen,500mg,Tablet,3.00,2.00,150,30,Analgesics,Supplier B,false,false`
    
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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

          <TabsContent value="manual" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Medicines to Add</h3>
                <p className="text-sm text-muted-foreground">
                  {medicines.length} medicine(s) • {validationResults.valid.length} valid • {validationResults.invalid.length} with errors
                </p>
              </div>
              <Button onClick={handleAddManual} variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Add Medicine
              </Button>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {medicines.map((med, index) => (
                <Card key={index} className={cn(validationResults.invalid.some(m => m.rowNumber === med.rowNumber) && "border-destructive")}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Medicine #{index + 1}</CardTitle>
                      <div className="flex items-center gap-2">
                        {validationResults.valid.some(m => m.rowNumber === med.rowNumber) ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMedicine(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    {med.errors && med.errors.length > 0 && (
                      <div className="text-sm text-destructive mt-2">
                        {med.errors.join(", ")}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name *</Label>
                        <Input
                          value={med.name}
                          onChange={(e) => handleUpdateMedicine(index, "name", e.target.value)}
                          placeholder="Medicine name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Generic Name</Label>
                        <Input
                          value={med.generic_name || ""}
                          onChange={(e) => handleUpdateMedicine(index, "generic_name", e.target.value)}
                          placeholder="Generic name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Strength *</Label>
                        <Input
                          value={med.strength}
                          onChange={(e) => handleUpdateMedicine(index, "strength", e.target.value)}
                          placeholder="e.g., 100mg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Form *</Label>
                        <Input
                          value={med.form}
                          onChange={(e) => handleUpdateMedicine(index, "form", e.target.value)}
                          placeholder="e.g., Tablet"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit Price *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={med.unit_price || ""}
                          onChange={(e) => handleUpdateMedicine(index, "unit_price", parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cost Price *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={med.cost_price || ""}
                          onChange={(e) => handleUpdateMedicine(index, "cost_price", parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stock Quantity *</Label>
                        <Input
                          type="number"
                          value={med.stock_quantity || ""}
                          onChange={(e) => handleUpdateMedicine(index, "stock_quantity", parseInt(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Minimum Stock *</Label>
                        <Input
                          type="number"
                          value={med.minimum_stock || ""}
                          onChange={(e) => handleUpdateMedicine(index, "minimum_stock", parseInt(e.target.value) || 10)}
                          placeholder="10"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {medicines.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No medicines added yet. Click "Add Medicine" to get started.</p>
                  </CardContent>
                </Card>
              )}
            </div>
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
    </Dialog>
  )
}

