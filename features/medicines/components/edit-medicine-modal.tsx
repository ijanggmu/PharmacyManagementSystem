"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { CurrencyDisplay } from "@/components/currency-display"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { validateMedicineForm, type MedicineFormErrors } from "@/lib/utils/medicine-form-validation"
import { FieldError } from "@/components/ui/field-error"
import { Medicine } from "@/features/medicines/api-client"
import { DualDateInput } from "@/components/ui/dual-date-input"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { suppliersApi } from "@/features/suppliers/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { settingsApi } from "@/features/settings/api-client"

interface EditMedicineModalProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function EditMedicineModal({ medicine, isOpen, onClose, onUpdate }: EditMedicineModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<Medicine>>({})
  const [fieldErrors, setFieldErrors] = useState<MedicineFormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [pharmacyCountry, setPharmacyCountry] = useState<string>("Nepal")
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newSupplierName, setNewSupplierName] = useState("")
  const [originalStock, setOriginalStock] = useState(0)
  const [adjustmentReason, setAdjustmentReason] = useState<string>("")
  const [adjustmentNotes, setAdjustmentNotes] = useState("")
  const { toast } = useToast()
  const { currentCurrency } = useCurrency()

  // Load pharmacy country from system settings
  useEffect(() => {
    const loadCountry = async () => {
      const { value } = await settingsApi.getByKey("pharmacy_country")
      setPharmacyCountry(value || "Nepal")
    }
    if (isOpen) {
      loadCountry()
    }
  }, [isOpen])

  // Initialize form data when medicine changes
  useEffect(() => {
    setFieldErrors({})
    if (medicine) {
      setFormData({
        name: medicine.name || "",
        generic_name: medicine.generic_name || "",
        brand_name: medicine.brand_name || "",
        dosage: medicine.dosage || "",
        form: medicine.form || "",
        strength: medicine.strength || "",
        unit_price: medicine.unit_price || "",
        cost_price: medicine.cost_price || "",
        stock_quantity: medicine.stock_quantity ?? 0,
        minimum_stock: medicine.minimum_stock ?? 0,
        maximum_stock: medicine.maximum_stock ?? 0,
        expiry_date: medicine.expiry_date || "",
        prescription_required: medicine.prescription_required ?? false,
        barcode: medicine.barcode || "",
        side_effects: medicine.side_effects || "",
        storage_instructions: medicine.storage_instructions || "",
        category_id: medicine.category_id || "",
        supplier_id: medicine.supplier_id || "",
        is_taxable: medicine.is_taxable ?? true,
        requires_cold_chain: (medicine as any).requires_cold_chain ?? false,
        storage_temp_min_c: (medicine as any).storage_temp_min_c ?? "",
        storage_temp_max_c: (medicine as any).storage_temp_max_c ?? "",
        units_per_pack: (medicine as any).units_per_pack ?? "",
        unit_label: (medicine as any).unit_label ?? "",
      } as Partial<Medicine>)
      setOriginalStock(medicine.stock_quantity ?? 0)
      setAdjustmentReason("")
      setAdjustmentNotes("")
      loadCategoriesAndSuppliers()
    } else {
      // Reset to empty defaults when medicine is null
      setFormData({
        name: "",
        generic_name: "",
        brand_name: "",
        dosage: "",
        form: "",
        strength: "",
        unit_price: "",
        cost_price: "",
        stock_quantity: 0,
        minimum_stock: 0,
        maximum_stock: 0,
        expiry_date: "",
        prescription_required: false,
        barcode: "",
        side_effects: "",
        storage_instructions: "",
        category_id: "",
        supplier_id: "",
      })
    }
  }, [medicine])

  const loadCategoriesAndSuppliers = async () => {
    const [categoriesResult, suppliersResult] = await Promise.all([
      categoriesApi.getCategories(),
      suppliersApi.getSuppliers(),
    ])

    if (!categoriesResult.error) setCategories(categoriesResult.data)
    if (!suppliersResult.error) setSuppliers(suppliersResult.data)
  }

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

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) {
      toast({
        title: "Error",
        description: "Supplier name is required",
        variant: "destructive",
      })
      return
    }

    try {
      const { data, error } = await suppliersApi.createSupplier({
        name: newSupplierName.trim(),
        contact_person: undefined,
        email: undefined,
        phone: undefined,
        address: undefined,
      })
      if (error || !data) throw new Error(error ?? "Failed to create supplier")

      setSuppliers([...suppliers, data])
      setFormData({ ...formData, supplier_id: data.id })
      setNewSupplierName("")
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!medicine) return
    const errors = validateMedicineForm(formData)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.getElementById(Object.keys(errors)[0])
      firstError?.focus()
      return
    }

    const newStock = Number(formData.stock_quantity ?? 0)
    if (newStock < originalStock && !adjustmentReason) {
      toast({
        title: "Reason required",
        description: "Select a reason for this stock decrease (breakage, theft, expiry write-off, count correction, or other).",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const updateData = {
        ...formData,
        category_id: formData.category_id || null,
        supplier_id: formData.supplier_id || null,
        storage_temp_min_c: (formData.storage_temp_min_c as any) === "" ? null : Number(formData.storage_temp_min_c),
        storage_temp_max_c: (formData.storage_temp_max_c as any) === "" ? null : Number(formData.storage_temp_max_c),
        units_per_pack: (formData.units_per_pack as any) === "" ? null : Number(formData.units_per_pack),
        unit_label: formData.unit_label || null,
        ...(newStock < originalStock
          ? { stock_adjustment_reason: adjustmentReason, stock_adjustment_notes: adjustmentNotes || null }
          : {}),
      }

      const { error } = await medicinesApi.updateMedicine(medicine.id, updateData)
      if (error) throw new Error(error)

      toast({
        title: "Success",
        description: "Medicine updated successfully",
      })

      // Invalidate medicine queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      // A stock increase against a supplier posts a payable — refresh supplier
      // balances too (both the old and new supplier if it was reassigned).
      if (updateData.supplier_id) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
        queryClient.invalidateQueries({ queryKey: supplierKeys.detail(updateData.supplier_id) })
      }
      if (medicine.supplier_id && medicine.supplier_id !== updateData.supplier_id) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.detail(medicine.supplier_id) })
      }

      // Trigger data refresh events for other components
      window.dispatchEvent(new CustomEvent("refresh-medicines"))
      window.dispatchEvent(new CustomEvent("refresh-data"))

      onUpdate()
      onClose()
    } catch (error) {
      console.error("Error updating medicine:", error)
      toast({
        title: "Error",
        description: "Failed to update medicine",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!medicine) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Edit Medicine</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Medicine Name *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined })
                }}
                aria-invalid={!!fieldErrors.name}
                required
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <Label htmlFor="generic_name">Generic Name</Label>
              <Input
                id="generic_name"
                value={formData.generic_name || ""}
                onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="brand_name">Brand Name</Label>
              <Input
                id="brand_name"
                value={formData.brand_name || ""}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="strength">Strength *</Label>
              <Input
                id="strength"
                value={formData.strength || ""}
                onChange={(e) => {
                  setFormData({ ...formData, strength: e.target.value })
                  if (fieldErrors.strength) setFieldErrors({ ...fieldErrors, strength: undefined })
                }}
                aria-invalid={!!fieldErrors.strength}
                required
              />
              <FieldError message={fieldErrors.strength} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="form">Form *</Label>
              <Select
                value={formData.form || ""}
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
              <Label htmlFor="unit_price">Unit Price * (tax-inclusive)</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={formData.unit_price || ""}
                onChange={(e) => {
                  setFormData({ ...formData, unit_price: e.target.value })
                  if (fieldErrors.unit_price) setFieldErrors({ ...fieldErrors, unit_price: undefined })
                }}
                aria-invalid={!!fieldErrors.unit_price}
                required
              />
              {formData.unit_price && currentCurrency.code !== "INR" && pharmacyCountry === "India" && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ ₹{((Number.parseFloat(formData.unit_price) || 0) * 83.5).toFixed(2)} (INR)
                </p>
              )}
              <FieldError message={fieldErrors.unit_price} />
            </div>
            <div>
              <Label htmlFor="cost_price">Cost Price *</Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                value={formData.cost_price || ""}
                onChange={(e) => {
                  setFormData({ ...formData, cost_price: e.target.value })
                  if (fieldErrors.cost_price) setFieldErrors({ ...fieldErrors, cost_price: undefined })
                }}
                aria-invalid={!!fieldErrors.cost_price}
                required
              />
              {formData.cost_price && currentCurrency.code !== "INR" && pharmacyCountry === "India" && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ ₹{((Number.parseFloat(formData.cost_price) || 0) * 83.5).toFixed(2)} (INR)
                </p>
              )}
              <FieldError message={fieldErrors.cost_price} />
            </div>
          </div>
          
          {/* Margin Display */}
          {formData.unit_price && formData.cost_price && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-xs text-muted-foreground">Margin Amount</Label>
                <p className="text-sm font-semibold text-primary">
                  <CurrencyDisplay amount={(Number.parseFloat(formData.unit_price) || 0) - (Number.parseFloat(formData.cost_price) || 0)} />
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Margin Percentage</Label>
                <p className="text-sm font-semibold text-primary">
                  {((Number.parseFloat(formData.unit_price) || 0) - (Number.parseFloat(formData.cost_price) || 0)) / (Number.parseFloat(formData.cost_price) || 1) * 100 > 0
                    ? `${(((Number.parseFloat(formData.unit_price) || 0) - (Number.parseFloat(formData.cost_price) || 0)) / (Number.parseFloat(formData.cost_price) || 1) * 100).toFixed(2)}%`
                    : "0%"}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="stock_quantity">Current Stock *</Label>
              <Input
                id="stock_quantity"
                type="number"
                value={formData.stock_quantity != null ? String(formData.stock_quantity) : ""}
                onChange={(e) => {
                  setFormData({ ...formData, stock_quantity: Number.parseInt(e.target.value) || 0 })
                  if (fieldErrors.stock_quantity) setFieldErrors({ ...fieldErrors, stock_quantity: undefined })
                }}
                aria-invalid={!!fieldErrors.stock_quantity}
                required
              />
              <FieldError message={fieldErrors.stock_quantity} />
            </div>
            <div>
              <Label htmlFor="minimum_stock">Minimum Stock *</Label>
              <Input
                id="minimum_stock"
                type="number"
                value={formData.minimum_stock != null ? String(formData.minimum_stock) : ""}
                onChange={(e) => {
                  setFormData({ ...formData, minimum_stock: Number.parseInt(e.target.value) || 0 })
                  if (fieldErrors.minimum_stock) setFieldErrors({ ...fieldErrors, minimum_stock: undefined })
                }}
                aria-invalid={!!fieldErrors.minimum_stock}
                required
              />
              <FieldError message={fieldErrors.minimum_stock} />
            </div>
            <div>
              <Label htmlFor="maximum_stock">Maximum Stock *</Label>
              <Input
                id="maximum_stock"
                type="number"
                value={formData.maximum_stock != null ? String(formData.maximum_stock) : ""}
                onChange={(e) => {
                  setFormData({ ...formData, maximum_stock: Number.parseInt(e.target.value) || 0 })
                  if (fieldErrors.maximum_stock) setFieldErrors({ ...fieldErrors, maximum_stock: undefined })
                }}
                aria-invalid={!!fieldErrors.maximum_stock}
                required
              />
              <FieldError message={fieldErrors.maximum_stock} />
            </div>
          </div>

          {Number(formData.stock_quantity ?? 0) < originalStock && (
            <div className="grid grid-cols-2 gap-4 p-3 border border-amber-300 bg-amber-50 rounded-lg">
              <div>
                <Label htmlFor="adjustment_reason">Reason for decrease *</Label>
                <Select value={adjustmentReason} onValueChange={setAdjustmentReason}>
                  <SelectTrigger id="adjustment_reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakage">Breakage</SelectItem>
                    <SelectItem value="theft">Theft</SelectItem>
                    <SelectItem value="expiry_writeoff">Expiry write-off</SelectItem>
                    <SelectItem value="count_correction">Count correction</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="adjustment_notes">Notes</Label>
                <Input
                  id="adjustment_notes"
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  placeholder="Optional detail"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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
                            Create New Category
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
                          Create New Category
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
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
                            Create New Supplier
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
                          Create New Supplier
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expiry_date">Expiry Date *</Label>
              <DualDateInput
                value={formData.expiry_date || ""}
                onChange={(value) => {
                  setFormData({ ...formData, expiry_date: value })
                  if (fieldErrors.expiry_date) setFieldErrors({ ...fieldErrors, expiry_date: undefined })
                }}
              />
              <FieldError message={fieldErrors.expiry_date} />
            </div>
            <div>
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={formData.barcode || ""}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="units_per_pack">Units per Pack</Label>
              <Input
                id="units_per_pack"
                type="number"
                min={1}
                value={(formData as any).units_per_pack ?? ""}
                onChange={(e) => setFormData({ ...formData, units_per_pack: e.target.value as any })}
                placeholder="e.g., 10"
              />
            </div>
            <div>
              <Label htmlFor="unit_label">Unit Label</Label>
              <Input
                id="unit_label"
                value={(formData as any).unit_label || ""}
                onChange={(e) => setFormData({ ...formData, unit_label: e.target.value as any })}
                placeholder="e.g., tablet, strip"
              />
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="requires_cold_chain"
                  checked={(formData as any).requires_cold_chain || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, requires_cold_chain: checked as any })}
                />
                <Label htmlFor="requires_cold_chain">Cold Chain</Label>
              </div>
            </div>
          </div>

          {(formData as any).requires_cold_chain && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="storage_temp_min_c">Min Temp (°C)</Label>
                <Input
                  id="storage_temp_min_c"
                  type="number"
                  step="0.1"
                  value={(formData as any).storage_temp_min_c ?? ""}
                  onChange={(e) => setFormData({ ...formData, storage_temp_min_c: e.target.value as any })}
                  placeholder="e.g., 2"
                />
              </div>
              <div>
                <Label htmlFor="storage_temp_max_c">Max Temp (°C)</Label>
                <Input
                  id="storage_temp_max_c"
                  type="number"
                  step="0.1"
                  value={(formData as any).storage_temp_max_c ?? ""}
                  onChange={(e) => setFormData({ ...formData, storage_temp_max_c: e.target.value as any })}
                  placeholder="e.g., 8"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="dosage">Dosage Instructions</Label>
            <Textarea
              id="dosage"
              value={formData.dosage || ""}
              onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="side_effects">Side Effects</Label>
            <Textarea
              id="side_effects"
              value={formData.side_effects || ""}
              onChange={(e) => setFormData({ ...formData, side_effects: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="storage_instructions">Storage Instructions</Label>
            <Textarea
              id="storage_instructions"
              value={formData.storage_instructions || ""}
              onChange={(e) => setFormData({ ...formData, storage_instructions: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="prescription_required"
                checked={formData.prescription_required || false}
                onCheckedChange={(checked) => setFormData({ ...formData, prescription_required: checked })}
              />
              <Label htmlFor="prescription_required">Prescription Required</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_taxable"
                checked={formData.is_taxable ?? true}
                onCheckedChange={(checked) => setFormData({ ...formData, is_taxable: checked })}
              />
              <Label htmlFor="is_taxable">Taxable</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update Medicine"}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newCategoryName">Category Name *</Label>
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
            <DialogTitle>Create New Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newSupplierName">Supplier Name *</Label>
              <Input
                id="newSupplierName"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Enter supplier name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateSupplier()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateSupplier(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSupplier}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
