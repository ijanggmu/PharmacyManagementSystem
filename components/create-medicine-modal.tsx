"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
import { createClient } from "@/lib/supabase/client"
import { Loader2, Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/lib/contexts/currency-context"
import { CurrencyDisplay } from "@/components/currency-display"
import { useQueryClient } from "@tanstack/react-query"
import { medicineKeys } from "@/lib/hooks/use-medicines"

interface CreateMedicineModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: () => void
  initialSupplierId?: string
}

export default function CreateMedicineModal({ isOpen, onClose, onCreate, initialSupplierId }: CreateMedicineModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    generic_name: "",
    dosage: "",
    form: "",
    strength: "",
    unit_price: "",
    cost_price: "",
    stock_quantity: "",
    minimum_stock: "",
    maximum_stock: "",
    expiry_date: "",
    batch_number: "",
    barcode: "",
    category_id: "",
    supplier_id: "",
    prescription_required: false,
    controlled_substance: false,
    is_taxable: true,
    side_effects: "",
    storage_instructions: "",
  })
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
  const { toast } = useToast()
  const { currentCurrency } = useCurrency()
  const queryClient = useQueryClient()

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const [categoriesResult, suppliersResult, countryResult] = await Promise.all([
        supabase.from("categories").select("*"),
        supabase.from("suppliers").select("*"),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "pharmacy_country")
          .single()
      ])

      if (categoriesResult.data) setCategories(categoriesResult.data)
      if (suppliersResult.data) setSuppliers(suppliersResult.data)
      if (countryResult.data?.value) {
        setPharmacyCountry(countryResult.data.value)
      } else {
        // Default to Nepal if not found
        setPharmacyCountry("Nepal")
      }
    }

    if (isOpen) {
      fetchData()
      // Pre-fill supplier if provided
      if (initialSupplierId) {
        setFormData((prev) => ({ ...prev, supplier_id: initialSupplierId }))
      }
    } else {
      // Reset form when modal closes
      setFormData({
        name: "",
        generic_name: "",
        dosage: "",
        form: "",
        strength: "",
        unit_price: "",
        cost_price: "",
        stock_quantity: "",
        minimum_stock: "",
        maximum_stock: "",
        expiry_date: "",
        batch_number: "",
        barcode: "",
        category_id: "",
        supplier_id: initialSupplierId || "",
        prescription_required: false,
        controlled_substance: false,
        is_taxable: true,
        side_effects: "",
        storage_instructions: "",
      })
    }
  }, [isOpen, initialSupplierId])

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from("categories")
        .insert([{ name: newCategoryName.trim() }])
        .select()
        .single()

      if (error) throw error

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

    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert([{ name: newSupplierName.trim() }])
        .select()
        .single()

      if (error) throw error

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
    setIsLoading(true)
    const supabase = createClient()

    try {
      const insertData = {
        ...formData,
        unit_price: Number.parseFloat(formData.unit_price),
        cost_price: Number.parseFloat(formData.cost_price),
        stock_quantity: Number.parseInt(formData.stock_quantity),
        minimum_stock: Number.parseInt(formData.minimum_stock),
        maximum_stock: Number.parseInt(formData.maximum_stock),
        category_id: formData.category_id || null,
        supplier_id: formData.supplier_id || null,
        side_effects: formData.side_effects || null,
        storage_instructions: formData.storage_instructions || null,
        barcode: formData.barcode || null,
      }

      const { data, error } = await supabase.from("medicines").insert([insertData]).select().single()

      if (error) throw error

      // Add initial inventory transaction if stock quantity is greater than 0
      if (Number.parseInt(formData.stock_quantity) > 0) {
        await supabase.from("inventory_transactions").insert({
          medicine_id: data.id,
          transaction_type: "purchase",
          quantity: Number.parseInt(formData.stock_quantity),
          reference_type: "initial_stock",
        })
      }

      // Invalidate medicine queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: medicineKeys.lists() })

      toast({
        title: "Success",
        description: "Medicine created successfully",
      })

      setFormData({
        name: "",
        generic_name: "",
        dosage: "",
        form: "",
        strength: "",
        unit_price: "",
        cost_price: "",
        stock_quantity: "",
        minimum_stock: "",
        maximum_stock: "",
        expiry_date: "",
        batch_number: "",
        barcode: "",
        category_id: "",
        supplier_id: "",
        prescription_required: false,
        controlled_substance: false,
        is_taxable: true,
        side_effects: "",
        storage_instructions: "",
      })
      
      // Trigger data refresh events for other components
      window.dispatchEvent(new CustomEvent("refresh-medicines"))
      window.dispatchEvent(new CustomEvent("refresh-data"))
      
      // Call the onCreate callback
      onCreate()
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
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
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
              <Select value={formData.form} onValueChange={(value) => setFormData({ ...formData, form: value })}>
                <SelectTrigger>
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
            </div>
            <div>
              <Label htmlFor="strength">Strength</Label>
              <Input
                id="strength"
                value={formData.strength}
                onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                placeholder="e.g., 10mg/ml"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="price">Selling Price *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                required
              />
              {formData.unit_price && currentCurrency.code !== "INR" && pharmacyCountry === "India" && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ ₹{((Number.parseFloat(formData.unit_price) || 0) * 83.5).toFixed(2)} (INR)
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="cost_price">Cost Price *</Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                required
              />
              {formData.cost_price && currentCurrency.code !== "INR" && pharmacyCountry === "India" && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ ₹{((Number.parseFloat(formData.cost_price) || 0) * 83.5).toFixed(2)} (INR)
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="stock_quantity">Stock Quantity *</Label>
              <Input
                id="stock_quantity"
                type="number"
                value={formData.stock_quantity}
                onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                required
              />
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
                onChange={(e) => setFormData({ ...formData, minimum_stock: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="maximum_stock">Maximum Stock *</Label>
              <Input
                id="maximum_stock"
                type="number"
                value={formData.maximum_stock}
                onChange={(e) => setFormData({ ...formData, maximum_stock: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expiry_date">Expiry Date *</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                required
              />
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

          <div>
            <Label htmlFor="barcode">Barcode</Label>
            <Input
              id="barcode"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
            />
          </div>

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
        <DialogContent className="max-w-md">
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
        <DialogContent className="max-w-md">
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
