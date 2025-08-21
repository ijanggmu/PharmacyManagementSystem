"use client"

import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { importMedicinesFromExcel, generateInventoryTemplate, ExcelMedicineRow } from "@/lib/utils/excel-utils"
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, X } from "lucide-react"

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
      const supabase = createClient()

      // Import medicines in batches
      const batchSize = 10
      const totalBatches = Math.ceil(medicines.length / batchSize)
      
      for (let i = 0; i < totalBatches; i++) {
        const batch = medicines.slice(i * batchSize, (i + 1) * batchSize)
        
        // Process each medicine in the batch
        for (const medicine of batch) {
          // Get or create category
          let categoryId = null
          if (medicine.category) {
            const { data: existingCategory } = await supabase
              .from("categories")
              .select("id")
              .eq("name", medicine.category)
              .single()

            if (existingCategory) {
              categoryId = existingCategory.id
            } else {
              const { data: newCategory } = await supabase
                .from("categories")
                .insert({ name: medicine.category })
                .select("id")
                .single()
              categoryId = newCategory?.id
            }
          }

          // Get or create supplier
          let supplierId = null
          if (medicine.supplier) {
            const { data: existingSupplier } = await supabase
              .from("suppliers")
              .select("id")
              .eq("name", medicine.supplier)
              .single()

            if (existingSupplier) {
              supplierId = existingSupplier.id
            } else {
              const { data: newSupplier } = await supabase
                .from("suppliers")
                .insert({ name: medicine.supplier })
                .select("id")
                .single()
              supplierId = newSupplier?.id
            }
          }

          // Insert medicine
          await supabase.from("medicines").insert({
            name: medicine.name,
            generic_name: medicine.generic_name,
            brand_name: medicine.brand_name,
            strength: medicine.strength,
            form: medicine.form,
            category_id: categoryId,
            supplier_id: supplierId,
            stock_quantity: medicine.stock_quantity,
            minimum_stock: medicine.minimum_stock,
            unit_price: medicine.unit_price.toString(),
            expiry_date: medicine.expiry_date,
            prescription_required: medicine.prescription_required || false,
            description: medicine.description,
            barcode: medicine.barcode,
          })
        }

        setImportProgress(((i + 1) / totalBatches) * 100)
      }

      toast({
        title: "Import successful",
        description: `Successfully imported ${medicines.length} medicines`,
      })

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${medicine.unit_price}</div>
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

