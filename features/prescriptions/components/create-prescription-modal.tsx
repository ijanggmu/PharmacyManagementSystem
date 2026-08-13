"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useInventory } from "@/features/medicines/hooks/use-inventory"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { customersApi } from "@/features/customers/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"

interface CreatePrescriptionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedCustomerId?: string
}

interface PrescriptionItem {
  medicine_id: string
  quantity_prescribed: number
  quantity_dispensed: number
  dosage_instructions: string
}

export default function CreatePrescriptionModal({ isOpen, onClose, onSuccess, selectedCustomerId }: CreatePrescriptionModalProps) {
  const [formData, setFormData] = useState({
    prescription_number: "",
    customer_id: "",
    doctor_name: "",
    doctor_license: "",
    issue_date: "",
    expiry_date: "",
    notes: "",
    status: "pending",
  })
  const [items, setItems] = useState<PrescriptionItem[]>([])
  const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { data: medicines } = useInventory()

  useEffect(() => {
    if (isOpen) {
      loadCustomers()
      // Generate prescription number
      const today = new Date()
      const defaultExpiry = new Date(today)
      defaultExpiry.setDate(defaultExpiry.getDate() + 180) // standard validity window; editable below
      setFormData((prev) => ({
        ...prev,
        prescription_number: `RX${Date.now()}`,
        issue_date: today.toISOString().split("T")[0],
        expiry_date: defaultExpiry.toISOString().split("T")[0],
        customer_id: selectedCustomerId || "",
      }))
      setItems([])
    }
  }, [isOpen, selectedCustomerId])

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        medicine_id: "",
        quantity_prescribed: 1,
        quantity_dispensed: 0,
        dosage_instructions: "",
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const loadCustomers = async () => {
    const { data, error } = await customersApi.getCustomers({ limit: 1000, sortBy: "first_name", sortOrder: "asc" } as any)
    if (!error) {
      setCustomers(
        (data || []).map((c: any) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
        }))
      )
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.customer_id) {
      toast({
        title: "Error",
        description: "Please select a customer to create a prescription",
        variant: "destructive",
      })
      return
    }

    if (items.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one medicine",
        variant: "destructive",
      })
      return
    }
    
    setIsLoading(true)
    try {
      const prescriptionItems = items.map((item) => ({
        medicine_id: item.medicine_id,
        quantity_prescribed: item.quantity_prescribed,
        quantity_dispensed: item.quantity_dispensed || 0,
        dosage_instructions: item.dosage_instructions,
      }))
      const result = await prescriptionsApi.createPrescription({
        prescription_number: formData.prescription_number,
        customer_id: formData.customer_id,
        doctor_name: formData.doctor_name,
        prescribed_date: formData.issue_date,
        expiry_date: formData.expiry_date || null,
        status: "pending",
        notes: formData.notes || undefined,
        prescription_items: prescriptionItems.map((item) => ({
          medicine_id: item.medicine_id,
          quantity_prescribed: item.quantity_prescribed,
          dosage_instructions: item.dosage_instructions,
        })) as any,
      })
      if (result.error) throw new Error(result.error)

      toast({
        title: "Success",
        description: "Prescription created successfully",
      })

      // Call the onSuccess callback (parent will handle refresh)
      onSuccess()
      onClose()
      setFormData({
        prescription_number: "",
        customer_id: "",
        doctor_name: "",
        doctor_license: "",
        issue_date: "",
        expiry_date: "",
        notes: "",
        status: "pending",
      })
      setItems([])
    } catch (error) {
      console.error("Error creating prescription:", error)
      toast({
        title: "Error",
        description: "Failed to create prescription",
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
          <DialogTitle>Create New Prescription</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prescription_number">Prescription Number *</Label>
              <Input
                id="prescription_number"
                value={formData.prescription_number}
                readOnly
                disabled
                className="bg-muted cursor-not-allowed"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Auto-generated</p>
            </div>
            <div>
              <Label htmlFor="customer_id">Customer {selectedCustomerId ? "(Pre-selected)" : "*"}</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                disabled={!!selectedCustomerId}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedCustomerId ? "Customer selected" : "Select customer"} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.first_name} {customer.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedCustomerId && (
                <p className="text-xs text-muted-foreground mt-1">Please select a customer to create a prescription</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="doctor_name">Doctor Name *</Label>
              <Input
                id="doctor_name"
                value={formData.doctor_name}
                onChange={(e) => setFormData({ ...formData, doctor_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="doctor_license">Doctor License</Label>
              <Input
                id="doctor_license"
                value={formData.doctor_license}
                onChange={(e) => setFormData({ ...formData, doctor_license: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="issue_date">Issue Date *</Label>
              <Input
                id="issue_date"
                type="date"
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Defaults to 180 days from issue. Sales against this prescription are blocked once it passes.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <Label>Prescription Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
            {items.length === 0 && (
              <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground">
                <p className="text-sm mb-2">No items added yet</p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Item
                </Button>
              </div>
            )}
            {items.map((item, index) => (
              <div key={index} className="space-y-2 p-3 border rounded mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <MedicineCombobox
                    medicines={medicines?.data}
                    value={item.medicine_id}
                    onValueChange={(value) => handleItemChange(index, "medicine_id", value)}
                    placeholder="Select Medicine"
                  />
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

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Add New Prescription"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
