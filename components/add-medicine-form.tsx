"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Save } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Category {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface AddMedicineFormProps {
  categories: Category[]
  suppliers: Supplier[]
  currentUser: any
}

export default function AddMedicineForm({ categories, suppliers, currentUser }: AddMedicineFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    generic_name: "",
    brand_name: "",
    strength: "",
    form: "",
    dosage: "", // Added dosage field that exists in database
    unit_price: "",
    cost_price: "", // Added cost_price field that exists in database
    stock_quantity: "",
    minimum_stock: "",
    maximum_stock: "", // Added maximum_stock field that exists in database
    expiry_date: "",
    batch_number: "",
    barcode: "", // Added barcode field that exists in database
    description: "",
    side_effects: "", // Added side_effects field that exists in database
    storage_instructions: "", // Added storage_instructions field that exists in database
    category_id: "",
    supplier_id: "",
    prescription_required: false,
    controlled_substance: false,
  })

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()

      // Validate required fields
      if (!formData.name || !formData.strength || !formData.form || !formData.unit_price) {
        throw new Error("Please fill in all required fields")
      }

      const medicineData = {
        name: formData.name,
        generic_name: formData.generic_name || null,
        brand_name: formData.brand_name || null,
        strength: formData.strength,
        form: formData.form,
        dosage: formData.dosage || null, // Added dosage field
        unit_price: Number.parseFloat(formData.unit_price),
        cost_price: Number.parseFloat(formData.cost_price) || null, // Added cost_price field
        stock_quantity: Number.parseInt(formData.stock_quantity) || 0,
        minimum_stock: Number.parseInt(formData.minimum_stock) || 0,
        maximum_stock: Number.parseInt(formData.maximum_stock) || null, // Added maximum_stock field
        expiry_date: formData.expiry_date || null,
        batch_number: formData.batch_number || null,
        barcode: formData.barcode || null, // Added barcode field
        description: formData.description || null,
        side_effects: formData.side_effects || null, // Added side_effects field
        storage_instructions: formData.storage_instructions || null, // Added storage_instructions field
        category_id: formData.category_id || null,
        supplier_id: formData.supplier_id || null,
        prescription_required: formData.prescription_required,
        controlled_substance: formData.controlled_substance,
      }

      // Insert medicine
      const { data, error } = await supabase.from("medicines").insert([medicineData]).select().single()

      if (error) throw error

      // Add initial inventory transaction
      if (Number.parseInt(formData.stock_quantity) > 0) {
        await supabase.from("inventory_transactions").insert({
          medicine_id: data.id,
          transaction_type: "purchase",
          quantity: Number.parseInt(formData.stock_quantity),
          reference_type: "initial_stock",
          user_id: currentUser.id,
        })
      }

      toast({
        title: "Success",
        description: "Medicine added successfully to inventory",
        variant: "default",
      })

      router.push("/dashboard/inventory")
    } catch (error) {
      console.error("Error adding medicine:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add medicine. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Medicine Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="Enter medicine name"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="generic_name">Generic Name</Label>
          <Input
            id="generic_name"
            value={formData.generic_name}
            onChange={(e) => handleInputChange("generic_name", e.target.value)}
            placeholder="Enter generic name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand_name">Brand Name</Label>
          <Input
            id="brand_name"
            value={formData.brand_name}
            onChange={(e) => handleInputChange("brand_name", e.target.value)}
            placeholder="Enter brand name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dosage">Dosage</Label>
          <Input
            id="dosage"
            value={formData.dosage}
            onChange={(e) => handleInputChange("dosage", e.target.value)}
            placeholder="e.g., 1 tablet twice daily"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="strength">Strength *</Label>
          <Input
            id="strength"
            value={formData.strength}
            onChange={(e) => handleInputChange("strength", e.target.value)}
            placeholder="e.g., 500mg, 10ml"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="form">Form *</Label>
          <Select value={formData.form} onValueChange={(value) => handleInputChange("form", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select form" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tablet">Tablet</SelectItem>
              <SelectItem value="capsule">Capsule</SelectItem>
              <SelectItem value="syrup">Syrup</SelectItem>
              <SelectItem value="injection">Injection</SelectItem>
              <SelectItem value="cream">Cream</SelectItem>
              <SelectItem value="ointment">Ointment</SelectItem>
              <SelectItem value="drops">Drops</SelectItem>
              <SelectItem value="inhaler">Inhaler</SelectItem>
              <SelectItem value="powder">Powder</SelectItem>
              <SelectItem value="solution">Solution</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          placeholder="Enter medicine description, usage instructions, etc."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="side_effects">Side Effects</Label>
          <Textarea
            id="side_effects"
            value={formData.side_effects}
            onChange={(e) => handleInputChange("side_effects", e.target.value)}
            placeholder="List common side effects"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="storage_instructions">Storage Instructions</Label>
          <Textarea
            id="storage_instructions"
            value={formData.storage_instructions}
            onChange={(e) => handleInputChange("storage_instructions", e.target.value)}
            placeholder="Storage temperature, conditions, etc."
            rows={3}
          />
        </div>
      </div>

      {/* Inventory & Pricing */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Inventory & Pricing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit_price">Unit Price * ($)</Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_price}
                onChange={(e) => handleInputChange("unit_price", e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost_price">Cost Price ($)</Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price}
                onChange={(e) => handleInputChange("cost_price", e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stock_quantity">Initial Stock</Label>
              <Input
                id="stock_quantity"
                type="number"
                min="0"
                value={formData.stock_quantity}
                onChange={(e) => handleInputChange("stock_quantity", e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minimum_stock">Minimum Stock Level</Label>
              <Input
                id="minimum_stock"
                type="number"
                min="0"
                value={formData.minimum_stock}
                onChange={(e) => handleInputChange("minimum_stock", e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="maximum_stock">Maximum Stock Level</Label>
              <Input
                id="maximum_stock"
                type="number"
                min="0"
                value={formData.maximum_stock}
                onChange={(e) => handleInputChange("maximum_stock", e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={formData.barcode}
                onChange={(e) => handleInputChange("barcode", e.target.value)}
                placeholder="Enter barcode"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch_number">Batch Number</Label>
              <Input
                id="batch_number"
                value={formData.batch_number}
                onChange={(e) => handleInputChange("batch_number", e.target.value)}
                placeholder="Enter batch number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => handleInputChange("expiry_date", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="category_id">Category</Label>
              <Select value={formData.category_id} onValueChange={(value) => handleInputChange("category_id", value)}>
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

            <div className="space-y-2">
              <Label htmlFor="supplier_id">Supplier</Label>
              <Select value={formData.supplier_id} onValueChange={(value) => handleInputChange("supplier_id", value)}>
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
        </CardContent>
      </Card>

      {/* Regulatory Information */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Regulatory Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <Label>Prescription Required</Label>
                <p className="text-sm text-gray-500">This medicine requires a prescription to dispense</p>
              </div>
              <Switch
                checked={formData.prescription_required}
                onCheckedChange={(checked) => handleInputChange("prescription_required", checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <Label>Controlled Substance</Label>
                <p className="text-sm text-gray-500">This medicine is a controlled substance</p>
              </div>
              <Switch
                checked={formData.controlled_substance}
                onCheckedChange={(checked) => handleInputChange("controlled_substance", checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex gap-4">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding Medicine...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Add New Medicine
            </>
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/inventory")} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
