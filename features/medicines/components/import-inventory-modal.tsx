"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { importMedicinesFromExcel, generateInventoryTemplate, ExcelMedicineRow } from "@/lib/utils/excel-utils"
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, X } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { suppliersApi } from "@/features/suppliers/api-client"
import { medicinesApi } from "@/features/medicines/api-client"

interface ImportInventoryModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

export default function ImportInventoryModal({ isOpen, onClose, onImportComplete }: ImportInventoryModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [previewData, setPreviewData] = useState<ExcelMedicineRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    // Validate file type
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast({
        title: "Invalid file type",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive",
      })
      return
    }

    setFile(selectedFile)
    setIsLoading(true)
    setValidationErrors([])

    try {
      const medicines = await importMedicinesFromExcel(selectedFile)
      setPreviewData(medicines.slice(0, 5)) // Show first 5 rows as preview
      setIsPreviewMode(true)
      
      // Validate the data
      const errors: string[] = []
      medicines.forEach((medicine, index) => {
        if (!medicine.name) errors.push(`Row ${index + 2}: Missing medicine name`)
        if (!medicine.stock_quantity || medicine.stock_quantity < 0) errors.push(`Row ${index + 2}: Invalid stock quantity`)
        if (!medicine.unit_price || medicine.unit_price <= 0) errors.push(`Row ${index + 2}: Invalid unit price`)
        if (!medicine.minimum_stock || medicine.minimum_stock < 0) errors.push(`Row ${index + 2}: Invalid minimum stock`)
      })
      
      setValidationErrors(errors)
      
      if (errors.length > 0) {
        toast({
          title: "Validation errors found",
          description: `${errors.length} errors found in the Excel file. Please fix them before importing.`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "File loaded successfully",
          description: `Found ${medicines.length} medicines to import`,
        })
      }
    } catch (error) {
      toast({
        title: "Error reading file",
        description: error instanceof Error ? error.message : "Failed to read Excel file",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    if (!file) return

    setIsLoading(true)
    setImportProgress(0)

    try {
      const medicines = await importMedicinesFromExcel(file)
      const categoryResult = await categoriesApi.getCategories()
      const supplierResult = await suppliersApi.getSuppliers()
      if (categoryResult.error) throw new Error(categoryResult.error)
      if (supplierResult.error) throw new Error(supplierResult.error)
      const categoryMap = new Map(categoryResult.data.map((c) => [c.name.toLowerCase(), c.id]))
      const supplierMap = new Map(supplierResult.data.map((s) => [s.name.toLowerCase(), s.id]))

      // Import medicines in batches with error tracking
      const batchSize = 10
      const totalBatches = Math.ceil(medicines.length / batchSize)
      const errors: string[] = []
      let successCount = 0

      for (let i = 0; i < totalBatches; i++) {
        const batch = medicines.slice(i * batchSize, (i + 1) * batchSize)
        
        // Process each medicine in the batch
        for (const medicine of batch) {
          try {
            const categoryName = medicine.category != null ? String(medicine.category).trim() : ""
            let categoryId: string | null = null
            if (categoryName) {
              const key = categoryName.toLowerCase()
              const existing = categoryMap.get(key)
              if (existing) categoryId = existing
              else {
                const created = await categoriesApi.createCategory(categoryName)
                if (created.error || !created.data) throw new Error(created.error || "Failed to create category")
                categoryId = created.data.id
                categoryMap.set(key, created.data.id)
              }
            }

            const supplierName = medicine.supplier != null ? String(medicine.supplier).trim() : ""
            let supplierId: string | null = null
            if (supplierName) {
              const key = supplierName.toLowerCase()
              const existing = supplierMap.get(key)
              if (existing) supplierId = existing
              else {
                const created = await suppliersApi.createSupplier({ name: supplierName })
                if (created.error || !created.data) throw new Error(created.error || "Failed to create supplier")
                supplierId = created.data.id
                supplierMap.set(key, created.data.id)
              }
            }

            const payload = {
              name: medicine.name,
              generic_name: medicine.generic_name || null,
              brand_name: medicine.brand_name || null,
              strength: medicine.strength || "",
              form: medicine.form || "",
              unit_price: Number(medicine.unit_price),
              cost_price: Number(medicine.cost_price ?? medicine.unit_price),
              stock_quantity: Number(medicine.stock_quantity),
              minimum_stock: Number(medicine.minimum_stock),
              maximum_stock: Math.max(Number(medicine.minimum_stock) * 10, Number(medicine.minimum_stock)),
              expiry_date: medicine.expiry_date || null,
              category_id: categoryId,
              supplier_id: supplierId,
              supplier_invoice_number: medicine.supplier_invoice_number != null ? String(medicine.supplier_invoice_number).trim() || null : null,
              description: medicine.description || null,
              controlled_substance: false,
              prescription_required: medicine.prescription_required || false,
              dosage: null,
              side_effects: null,
              storage_instructions: null,
              barcode: medicine.barcode || null,
            }

            const created = await medicinesApi.createMedicine(payload)
            if (created.error || !created.data) throw new Error(created.error || "Failed to insert medicine")
            successCount++
          } catch (error: any) {
            errors.push(`${medicine.name}: ${error?.message || "Unknown error"}`)
          }
        }

        setImportProgress(((i + 1) / totalBatches) * 100)
      }

      if (errors.length > 0) {
        toast({
          title: "Import completed with errors",
          description: `Imported ${successCount} of ${medicines.length} medicines. ${errors.length} failed.`,
          variant: "destructive",
        })
        console.error("Import errors:", errors)
      } else {
        toast({
          title: "Import successful",
          description: `Successfully imported ${successCount} medicines`,
        })
      }

      onImportComplete()
      handleClose()
    } catch (error) {
      console.error("Import error:", error)
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import medicines",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setImportProgress(0)
    }
  }

  const handleDownloadTemplate = () => {
    generateInventoryTemplate()
    toast({
      title: "Template downloaded",
      description: "Inventory import template has been downloaded",
    })
  }

  const handleClose = () => {
    setFile(null)
    setPreviewData([])
    setValidationErrors([])
    setIsPreviewMode(false)
    setImportProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Inventory from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to import medicines into your inventory. Make sure your file follows the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Excel File
              </CardTitle>
              <CardDescription>
                Select an Excel file (.xlsx or .xls) containing your medicine data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  disabled={isLoading}
                />
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  disabled={isLoading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              {file && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null)
                      setPreviewData([])
                      setValidationErrors([])
                      setIsPreviewMode(false)
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ""
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Validation errors found:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.slice(0, 5).map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                    {validationErrors.length > 5 && (
                      <li className="text-sm">... and {validationErrors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview Section */}
          {isPreviewMode && previewData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Preview (First 5 rows)</CardTitle>
                <CardDescription>
                  Review the data before importing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {previewData.map((medicine, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="font-medium">{medicine.name}</div>
                        <div className="text-sm text-gray-500">
                          {medicine.strength} • {medicine.form} • Qty: {medicine.stock_quantity}
                          {medicine.supplier_invoice_number ? ` • Bill: ${medicine.supplier_invoice_number}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          <CurrencyDisplay amount={medicine.unit_price} />
                        </div>
                        <Badge variant={medicine.prescription_required ? "default" : "secondary"}>
                          {medicine.prescription_required ? "Prescription" : "OTC"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Progress */}
          {isLoading && importProgress > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Importing Medicines...</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={importProgress} className="w-full" />
                <p className="text-sm text-gray-600 mt-2">
                  {Math.round(importProgress)}% complete
                </p>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || isLoading || validationErrors.length > 0}
            >
              {isLoading ? "Importing..." : "Import Medicines"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
