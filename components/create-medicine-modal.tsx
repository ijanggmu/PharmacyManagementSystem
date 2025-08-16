"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

interface CreateMedicineModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: () => void
}

export default function CreateMedicineModal({ isOpen, onClose, onCreate }: CreateMedicineModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    generic_name: "",
    dosage: "",
    form: "",
    strength: "",
    price: "",
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
    side_effects: "",
    storage_instructions: "",
  })
  const [categories, setCategories] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const [categoriesResult, suppliersResult] = await Promise.all([
        supabase.from("categories").select("*"),
        supabase.from("suppliers").select("*"),
      ])

      if (categoriesResult.data) setCategories(categoriesResult.data)
      if (suppliersResult.data) setSuppliers(suppliersResult.data)
    }

    if (isOpen) {
      fetchData()
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const supabase = createClient()

    try {
      const insertData = {
        ...formData,
        price: Number.parseFloat(formData.price),
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

      const { error } = await supabase.from("medicines").insert([insertData])

      if (error) throw error

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
        price: "",
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
        side_effects: "",
        storage_instructions: "",
      })
      onCreate()
      onClose()
    } catch (error) {
      console.error("Error creating medicine:", error)
      toast({
        title: "Error",
        description: "Failed to create medicine",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
              />
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
              <Select
                value={formData.category_id}
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
                value={formData.supplier_id}
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
              Create Medicine
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
