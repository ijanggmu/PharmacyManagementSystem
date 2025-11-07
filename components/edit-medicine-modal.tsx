"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface Medicine {
  id: string
  name: string
  generic_name: string
  brand_name: string
  dosage: string
  form: string
  strength: string
  unit_price: string
  cost_price: string
  stock_quantity: number
  minimum_stock: number
  maximum_stock: number
  expiry_date: string
  prescription_required: boolean
  barcode: string | null
  side_effects: string | null
  storage_instructions: string | null
  category_id: string | null
  supplier_id: string | null
}

interface EditMedicineModalProps {
  medicine: Medicine | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function EditMedicineModal({ medicine, isOpen, onClose, onUpdate }: EditMedicineModalProps) {
  const [formData, setFormData] = useState<Partial<Medicine>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const { toast } = useToast()

  // Initialize form data when medicine changes
  useEffect(() => {
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
      })
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
    const supabase = createClient()

    const [categoriesResult, suppliersResult] = await Promise.all([
      supabase.from("categories").select("id, name"),
      supabase.from("suppliers").select("id, name"),
    ])

    if (categoriesResult.data) setCategories(categoriesResult.data)
    if (suppliersResult.data) setSuppliers(suppliersResult.data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!medicine) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const updateData = {
        ...formData,
        category_id: formData.category_id || null,
        supplier_id: formData.supplier_id || null,
      }

      const { error } = await supabase.from("medicines").update(updateData).eq("id", medicine.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Medicine updated successfully",
      })

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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
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
                onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="form">Form *</Label>
              <Select value={formData.form || ""} onValueChange={(value) => setFormData({ ...formData, form: value })}>
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
              <Label htmlFor="unit_price">Unit Price *</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                value={formData.unit_price || ""}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="cost_price">Cost Price *</Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                value={formData.cost_price || ""}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="stock_quantity">Current Stock *</Label>
              <Input
                id="stock_quantity"
                type="number"
                value={formData.stock_quantity != null ? String(formData.stock_quantity) : ""}
                onChange={(e) => setFormData({ ...formData, stock_quantity: Number.parseInt(e.target.value) || 0 })}
                required
              />
            </div>
            <div>
              <Label htmlFor="minimum_stock">Minimum Stock *</Label>
              <Input
                id="minimum_stock"
                type="number"
                value={formData.minimum_stock != null ? String(formData.minimum_stock) : ""}
                onChange={(e) => setFormData({ ...formData, minimum_stock: Number.parseInt(e.target.value) || 0 })}
                required
              />
            </div>
            <div>
              <Label htmlFor="maximum_stock">Maximum Stock *</Label>
              <Input
                id="maximum_stock"
                type="number"
                value={formData.maximum_stock != null ? String(formData.maximum_stock) : ""}
                onChange={(e) => setFormData({ ...formData, maximum_stock: Number.parseInt(e.target.value) || 0 })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category_id">Category</Label>
              <Select
                value={formData.category_id || ""}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="supplier_id">Supplier</Label>
              <Select
                value={formData.supplier_id || ""}
                onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expiry_date">Expiry Date *</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date || ""}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                required
              />
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

          <div className="flex items-center space-x-2">
            <Switch
              id="prescription_required"
              checked={formData.prescription_required || false}
              onCheckedChange={(checked) => setFormData({ ...formData, prescription_required: checked })}
            />
            <Label htmlFor="prescription_required">Prescription Required</Label>
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
    </Dialog>
  )
}
