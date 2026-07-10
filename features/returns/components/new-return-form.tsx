"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Minus, Plus, Package, AlertTriangle } from "lucide-react"
import { Medicine } from "@/features/medicines/api-client"
import { supplierReturnsApi } from "@/features/suppliers/api-client-returns"

interface Supplier {
  id: string
  name: string
  contact_person: string
  phone: string
  email: string
}

interface User {
  id: string
  full_name: string
  email: string
}

interface ReturnItem {
  medicine_id: string
  medicine: Medicine | null
  quantity: number
  unit_cost: number
  total_cost: number
  return_reason: string
  notes: string
}

interface NewReturnFormProps {
  medicines: Medicine[]
  suppliers: Supplier[]
  currentUser: User | null
  onSuccess?: () => void
}

export default function NewReturnForm({ medicines, suppliers, currentUser, onSuccess }: NewReturnFormProps) {
  const [selectedSupplier, setSelectedSupplier] = useState("")
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const supplierMedicines = medicines.filter((med) => med.suppliers?.id === selectedSupplier)

  const addReturnItem = () => {
    const newItem: ReturnItem = {
      medicine_id: "",
      medicine: null as Medicine | null,
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      return_reason: "expired",
      notes: "",
    }
    setReturnItems([...returnItems, newItem])
  }

  const removeReturnItem = (index: number) => {
    setReturnItems(returnItems.filter((_, i) => i !== index))
  }

  const updateReturnItem = (index: number, field: keyof ReturnItem, value: any) => {
    const updatedItems = [...returnItems]
    if (field === "medicine_id") {
      const medicine = supplierMedicines.find((med) => med.id === value)
      if (medicine) {
        updatedItems[index].medicine = medicine
        updatedItems[index].unit_cost = Number.parseFloat(medicine.unit_price)
        updatedItems[index].total_cost = updatedItems[index].quantity * Number.parseFloat(medicine.unit_price)
      }
      updatedItems[index].medicine_id = value
    } else if (field === "quantity") {
      updatedItems[index].quantity = value
      updatedItems[index].total_cost = value * updatedItems[index].unit_cost
    } else if (field === "unit_cost") {
      updatedItems[index].unit_cost = value
      updatedItems[index].total_cost = updatedItems[index].quantity * value
    } else if (field === "return_reason") {
      updatedItems[index].return_reason = value
    } else if (field === "notes") {
      updatedItems[index].notes = value
    }
    setReturnItems(updatedItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser || !selectedSupplier || returnItems.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and add at least one item",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      for (const item of returnItems) {
        const med = medicines.find((m) => m.id === item.medicine_id)
        const stock = med?.stock_quantity ?? 0
        if (stock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.medicine?.name ?? "item"} (have ${stock})`)
        }
      }

      const result = await supplierReturnsApi.create({
        supplier_id: selectedSupplier,
        notes: notes || undefined,
        items: returnItems.map((item) => ({
          medicine_id: item.medicine_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          return_reason: item.return_reason,
          notes: item.notes || undefined,
        })),
      })
      if (result.error) throw new Error(result.error)

      toast({
        title: "Return posted",
        description: "Goods returned to supplier and stock updated successfully.",
      })

      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/dashboard/returns")
      }
    } catch (error) {
      console.error("Error creating return:", error)
      toast({
        title: "Error",
        description: "Failed to create return. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Return Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier *</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name} - {supplier.contact_person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="processed_by">Processed By</Label>
              <Input value={currentUser?.full_name || ""} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Return Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about this return..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Return Items
            </span>
            <Button type="button" onClick={addReturnItem} disabled={!selectedSupplier}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {returnItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {!selectedSupplier ? "Please select a supplier first" : "No items added yet. Click 'Add Item' to start."}
            </div>
          ) : (
            <div className="space-y-4">
              {returnItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Item {index + 1}</h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => removeReturnItem(index)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Medicine *</Label>
                      <Select
                        value={item.medicine_id}
                        onValueChange={(value) => updateReturnItem(index, "medicine_id", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select medicine" />
                        </SelectTrigger>
                        <SelectContent>
                          {supplierMedicines.map((medicine) => (
                            <SelectItem key={medicine.id} value={medicine.id}>
                              {medicine.name} - {medicine.strength} {medicine.form}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateReturnItem(index, "quantity", Number.parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Cost</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateReturnItem(index, "unit_cost", Number.parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Cost</Label>
                      <Input value={`$${item.total_cost.toFixed(2)}`} disabled />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Return Reason *</Label>
                      <Select
                        value={item.return_reason}
                        onValueChange={(value) => updateReturnItem(index, "return_reason", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="defective">Defective</SelectItem>
                          <SelectItem value="wrong_item">Wrong Item</SelectItem>
                          <SelectItem value="overstocked">Overstocked</SelectItem>
                          <SelectItem value="recalled">Recalled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Item Notes</Label>
                      <Input
                        placeholder="Additional notes for this item..."
                        value={item.notes}
                        onChange={(e) => updateReturnItem(index, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total Return Value:</span>
                  <span>${returnItems.reduce((sum, item) => sum + item.total_cost, 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        {!onSuccess && (
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || returnItems.length === 0}>
          {isSubmitting ? "Creating Return..." : "Create Return"}
        </Button>
      </div>
    </form>
  )
}
