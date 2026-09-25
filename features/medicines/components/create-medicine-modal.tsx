"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { CurrencyDisplay } from "@/components/currency-display"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/features/medicines/hooks/use-medicines"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { validateMedicineForm, type MedicineFormErrors } from "@/lib/utils/medicine-form-validation"
import { FieldError } from "@/components/ui/field-error"
import { DualDateInput } from "@/components/ui/dual-date-input"
import { supplierNameSchema } from "@/lib/utils/validation"
import ConfirmNewSupplierDialog from "@/features/suppliers/components/confirm-new-supplier-dialog"
import { nepalMedicineCatalogApi, NepalMedicineCatalogItem } from "@/features/medicines/api-client-nepal-catalog"
import { categoriesApi } from "@/features/medicines/api-client-categories"
import { suppliersApi } from "@/features/suppliers/api-client"
import { medicinesApi } from "@/features/medicines/api-client"
import { settingsApi } from "@/features/settings/api-client"

interface CreateMedicineModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (medicine?: { id: string; name: string }) => void
  initialSupplierId?: string
  initialName?: string
}

export default function CreateMedicineModal({ isOpen, onClose, onCreate, initialSupplierId, initialName }: CreateMedicineModalProps) {
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
    is_taxable: true,
    side_effects: "",
    storage_instructions: "",
    requires_cold_chain: false,
    storage_temp_min_c: "",
    storage_temp_max_c: "",
    units_per_pack: "",
    unit_label: "",
  }
  const [formData, setFormData] = useState(emptyFormData)
  const [similarNames, setSimilarNames] = useState<{ id: string; name: string; strength: string | null; form: string | null }[]>([])
  const [fieldErrors, setFieldErrors] = useState<MedicineFormErrors>({})
  const [categories, setCategories] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [pharmacyCountry, setPharmacyCountry] = useState<string>("Nepal")
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
      const [categoriesResult, suppliersResult, countryResult] = await Promise.all([
        categoriesApi.getCategories(),
        suppliersApi.getSuppliers(),
        settingsApi.getByKey("pharmacy_country"),
      ])

      if (!categoriesResult.error) setCategories(categoriesResult.data)
      if (!suppliersResult.error) setSuppliers(suppliersResult.data)
      setPharmacyCountry(countryResult.value || "Nepal")
    }

    if (isOpen) {
      fetchData()
      // Pre-fill supplier/name if provided
      setFormData((prev) => ({
        ...prev,
        supplier_id: initialSupplierId || prev.supplier_id,
        name: initialName || prev.name,
      }))
    } else {
      // Reset form when modal closes
      catalogSelectionRef.current = null
      setCatalogOpen(false)
      setCatalogItems([])
      setFormData({ ...emptyFormData, supplier_id: initialSupplierId || "" })
      setFieldErrors({})
    }
  }, [isOpen, initialSupplierId, initialName])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateMedicineForm(formData)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.getElementById(Object.keys(errors)[0])
      firstError?.focus()
      return
    }
    setIsLoading(true)
    try {
      const insertData: Parameters<typeof medicinesApi.createMedicine>[0] = {
        ...formData,
        // API validates unit_price/cost_price as numbers, not strings
        unit_price: Number.parseFloat(formData.unit_price) as any,
        cost_price: Number.parseFloat(formData.cost_price) as any,
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
        vat_amount: formData.vat_amount ? Number.parseFloat(formData.vat_amount) : null,
        requires_cold_chain: formData.requires_cold_chain,
        storage_temp_min_c: formData.storage_temp_min_c ? Number.parseFloat(formData.storage_temp_min_c) : null,
        storage_temp_max_c: formData.storage_temp_max_c ? Number.parseFloat(formData.storage_temp_max_c) : null,
        units_per_pack: formData.units_per_pack ? Number.parseInt(formData.units_per_pack) : null,
        unit_label: formData.unit_label || null,
      }

      const { data, error } = await medicinesApi.createMedicine(insertData)
      if (error || !data) throw new Error(error ?? "Failed to create medicine")

      // Invalidate medicine queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })
      queryClient.invalidateQueries({ queryKey: medicineKeys.stats() })
      // Initial stock + a supplier posts a payable on the supplier ledger — refresh
      // supplier balances too, or the Suppliers page shows a stale amount.
      if (insertData.supplier_id) {
        queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
        queryClient.invalidateQueries({ queryKey: supplierKeys.detail(insertData.supplier_id) })
      }

      toast({
        title: "Success",
        description: "Medicine created successfully",
      })

      setFormData(emptyFormData)
      setFieldErrors({})

      // Trigger data refresh events for other components
      window.dispatchEvent(new CustomEvent("refresh-medicines"))
      window.dispatchEvent(new CustomEvent("refresh-data"))

      // Call the onCreate callback
      onCreate({ id: data.id, name: data.name })
      onClose()
    } catch (error: any) {
      console.error("Error creating medicine:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to create medicine",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const applyCatalogSuggestion = async (item: NepalMedicineCatalogItem) => {
    const name = item.brand_name || formData.name
    catalogSelectionRef.current = name.trim()
    setCatalogItems([])
    setCatalogOpen(false)
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Create New Medicine</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Medicine Name *</Label>
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
                <p className="mt-1.5 text-xs text-amber-600 flex items-start gap-1">
                  <span>⚠</span>
                  <span>
                    Similar existing name{similarNames.length > 1 ? "s" : ""}:{" "}
                    {similarNames.map((m) => `${m.name}${m.strength ? ` (${m.strength})` : ""}`).join(", ")} —
                    double-check this isn't a look-alike/sound-alike mix-up.
                  </span>
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="generic_name">Generic Name *</Label>
              <Input
                id="generic_name"
                value={formData.generic_name}
                onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="brand_name">Brand Name</Label>
              <Input
                id="brand_name"
                value={formData.brand_name}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dosage">Dosage *</Label>
              <Input
                id="dosage"
                value={formData.dosage}
                onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                placeholder="e.g., 500mg"
                required
              />
            </div>
            <div>
              <Label htmlFor="form">Form *</Label>
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
                placeholder="e.g., 10mg/ml"
              />
              <FieldError message={fieldErrors.strength} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="unit_price">Selling Price * (tax-inclusive)</Label>
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
              <p className="text-xs text-muted-foreground mt-1">
                Tax is calculated from this price when "Taxable" is on below — don't add tax on top.
              </p>
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
                value={formData.cost_price}
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
            <div>
              <Label htmlFor="stock_quantity">Stock Quantity *</Label>
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
              <FieldError message={fieldErrors.stock_quantity} />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="minimum_stock">Minimum Stock *</Label>
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
              />
              <FieldError message={fieldErrors.minimum_stock} />
            </div>
            <div>
              <Label htmlFor="maximum_stock">Maximum Stock *</Label>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expiry_date">Expiry Date *</Label>
              <DualDateInput
                value={formData.expiry_date}
                onChange={(value) => {
                  setFormData({ ...formData, expiry_date: value })
                  if (fieldErrors.expiry_date) setFieldErrors({ ...fieldErrors, expiry_date: undefined })
                }}
              />
              <FieldError message={fieldErrors.expiry_date} />
            </div>
            <div>
              <Label htmlFor="batch_number">Batch Number *</Label>
              <Input
                id="batch_number"
                value={formData.batch_number}
                onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                required
              />
            </div>
          </div>

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

          {formData.supplier_id && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplier_invoice_number">Supplier Bill / Invoice No.</Label>
                <Input
                  id="supplier_invoice_number"
                  value={formData.supplier_invoice_number}
                  onChange={(e) => setFormData({ ...formData, supplier_invoice_number: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor="vat_amount">Line VAT</Label>
                <Input
                  id="vat_amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.vat_amount}
                  onChange={(e) => setFormData({ ...formData, vat_amount: e.target.value })}
                  placeholder="0"
                  title="Recoverable VAT on this supplier receipt (optional)"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="barcode">Barcode</Label>
            <Input
              id="barcode"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="units_per_pack">Units per Pack</Label>
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
              <Label htmlFor="unit_label">Unit Label</Label>
              <Input
                id="unit_label"
                value={formData.unit_label}
                onChange={(e) => setFormData({ ...formData, unit_label: e.target.value })}
                placeholder="e.g., tablet, strip"
              />
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="requires_cold_chain"
                  checked={formData.requires_cold_chain}
                  onCheckedChange={(checked) => setFormData({ ...formData, requires_cold_chain: checked })}
                />
                <Label htmlFor="requires_cold_chain">Cold Chain</Label>
              </div>
            </div>
          </div>

          {formData.requires_cold_chain && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="storage_temp_min_c">Min Temp (°C)</Label>
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
                <Label htmlFor="storage_temp_max_c">Max Temp (°C)</Label>
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

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="prescription_required"
                checked={formData.prescription_required}
                onCheckedChange={(checked) => setFormData({ ...formData, prescription_required: checked })}
              />
              <Label htmlFor="prescription_required">Prescription Required</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="controlled_substance"
                checked={formData.controlled_substance}
                onCheckedChange={(checked) => setFormData({ ...formData, controlled_substance: checked })}
              />
              <Label htmlFor="controlled_substance">Controlled Substance</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_taxable"
                checked={formData.is_taxable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_taxable: checked })}
              />
              <Label htmlFor="is_taxable">Taxable</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="side_effects">Side Effects</Label>
            <Textarea
              id="side_effects"
              value={formData.side_effects}
              onChange={(e) => setFormData({ ...formData, side_effects: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="storage_instructions">Storage Instructions</Label>
            <Textarea
              id="storage_instructions"
              value={formData.storage_instructions}
              onChange={(e) => setFormData({ ...formData, storage_instructions: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add New Medicine
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
    </Dialog>
  )
}
