"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useCreatePrescription } from "@/lib/hooks/use-prescriptions"
import { useCustomers } from "@/lib/hooks/use-customers"
import { useInventory } from "@/lib/hooks/use-inventory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface PrescriptionItem {
  medicine_id: string
  quantity_prescribed: number
  quantity_dispensed: number
  dosage_instructions: string
}

interface AddPrescriptionFormProps {
  onSuccess?: () => void
}

export default function AddPrescriptionForm({ onSuccess }: AddPrescriptionFormProps = {}) {
  const router = useRouter()
  const { toast } = useToast()
  const createMutation = useCreatePrescription()
  const { data: customers } = useCustomers()
  const { data: medicines } = useInventory()

  const [formData, setFormData] = useState({
    prescription_number: "",
    customer_id: "",
    doctor_name: "",
    prescribed_date: new Date().toISOString().split("T")[0],
    status: "pending" as const,
    notes: "",
    items: [] as PrescriptionItem[],
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          medicine_id: "",
          quantity_prescribed: 1,
          quantity_dispensed: 0,
          dosage_instructions: "",
        },
      ],
    }))
  }

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.prescription_number || !formData.customer_id || !formData.doctor_name) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      })
      return
    }

    if (formData.items.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one medicine",
        variant: "destructive",
      })
      return
    }

    createMutation.mutate(
      {
        prescription_number: formData.prescription_number,
        customer_id: formData.customer_id,
        doctor_name: formData.doctor_name,
        prescribed_date: formData.prescribed_date,
        status: formData.status,
        notes: formData.notes,
        prescription_items: formData.items,
      },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "Prescription created successfully",
          })
          if (onSuccess) {
            onSuccess()
          } else {
            router.push("/dashboard/prescriptions")
          }
        },
      },
    )
  }

  return (
    <div className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Prescription Number</label>
              <Input
                name="prescription_number"
                value={formData.prescription_number}
                onChange={handleInputChange}
                placeholder="RX-001"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Customer</label>
              <select
                name="customer_id"
                value={formData.customer_id}
                onChange={handleInputChange}
                className="w-full border rounded px-2 py-1"
                required
              >
                <option value="">Select Customer</option>
                {customers?.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.first_name} {customer.last_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Doctor Name</label>
              <Input
                name="doctor_name"
                value={formData.doctor_name}
                onChange={handleInputChange}
                placeholder="Dr. Smith"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Prescribed Date</label>
              <Input
                name="prescribed_date"
                type="date"
                value={formData.prescribed_date}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Additional notes..."
              className="w-full border rounded px-2 py-1"
              rows={3}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium">Prescription Items</label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
            {formData.items.length === 0 && (
              <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground">
                <p className="text-sm mb-2">No items added yet</p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Item
                </Button>
              </div>
            )}
            {formData.items.map((item, index) => (
              <div key={index} className="space-y-2 p-3 border rounded mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={item.medicine_id}
                    onChange={(e) => handleItemChange(index, "medicine_id", e.target.value)}
                    className="w-full border rounded px-2 py-1"
                    required
                  >
                    <option value="">Select Medicine</option>
                    {medicines?.data?.map((medicine) => (
                      <option key={medicine.id} value={medicine.id}>
                        {medicine.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    value={item.quantity_prescribed}
                    onChange={(e) => handleItemChange(index, "quantity_prescribed", Number.parseInt(e.target.value))}
                    placeholder="Quantity"
                    min="1"
                    required
                  />
                </div>
                <Input
                  value={item.dosage_instructions}
                  onChange={(e) => handleItemChange(index, "dosage_instructions", e.target.value)}
                  placeholder="Dosage instructions"
                  required
                />
                <Button type="button" variant="destructive" size="sm" onClick={() => handleRemoveItem(index)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Prescription"}
            </Button>
            {!onSuccess && (
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            )}
          </div>
        </form>
    </div>
  )
}
