"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save, Plus, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string | null
}

interface Medicine {
  id: string
  name: string
  generic_name: string | null
  strength: string
  form: string
}

interface PrescriptionItem {
  medicineId: string
  quantity: number
  instructions: string
}

interface AddPrescriptionFormProps {
  customers: Customer[]
  medicines: Medicine[]
}

export default function AddPrescriptionForm({ customers, medicines }: AddPrescriptionFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    customerId: "",
    doctorName: "",
    doctorLicense: "",
    issueDate: new Date().toISOString().split("T")[0],
    notes: "",
  })
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([
    { medicineId: "", quantity: 1, instructions: "" },
  ])

  const generatePrescriptionNumber = () => {
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    return `RX${year}${month}${day}${random}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validate prescription items
      const validItems = prescriptionItems.filter((item) => item.medicineId && item.quantity > 0)
      if (validItems.length === 0) {
        throw new Error("Please add at least one medication")
      }

      // Insert prescription
      const prescriptionNumber = generatePrescriptionNumber()
      const { data: prescription, error: prescriptionError } = await supabase
        .from("prescriptions")
        .insert({
          prescription_number: prescriptionNumber,
          customer_id: formData.customerId,
          doctor_name: formData.doctorName,
          doctor_license: formData.doctorLicense || null,
          issue_date: formData.issueDate,
          notes: formData.notes || null,
          status: "pending",
        })
        .select()
        .single()

      if (prescriptionError) {
        throw prescriptionError
      }

      // Insert prescription items
      const itemsToInsert = validItems.map((item) => ({
        prescription_id: prescription.id,
        medicine_id: item.medicineId,
        quantity_prescribed: item.quantity,
        dosage_instructions: item.instructions,
      }))

      const { error: itemsError } = await supabase.from("prescription_items").insert(itemsToInsert)

      if (itemsError) {
        throw itemsError
      }

      toast({
        title: "Success",
        description: `Prescription ${prescriptionNumber} created successfully`,
      })

      router.push("/dashboard/prescriptions")
    } catch (error) {
      console.error("Error creating prescription:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create prescription. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const addPrescriptionItem = () => {
    setPrescriptionItems((prev) => [...prev, { medicineId: "", quantity: 1, instructions: "" }])
  }

  const removePrescriptionItem = (index: number) => {
    setPrescriptionItems((prev) => prev.filter((_, i) => i !== index))
  }

  const updatePrescriptionItem = (index: number, field: keyof PrescriptionItem, value: string | number) => {
    setPrescriptionItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Prescription Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customerId">Customer *</Label>
          <Select value={formData.customerId} onValueChange={(value) => handleChange("customerId", value)} required>
            <SelectTrigger>
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.first_name} {customer.last_name}
                  {customer.phone && ` - ${customer.phone}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="issueDate">Issue Date *</Label>
          <Input
            id="issueDate"
            type="date"
            value={formData.issueDate}
            onChange={(e) => handleChange("issueDate", e.target.value)}
            required
          />
        </div>
      </div>

      {/* Doctor Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Doctor Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="doctorName">Doctor Name *</Label>
              <Input
                id="doctorName"
                value={formData.doctorName}
                onChange={(e) => handleChange("doctorName", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doctorLicense">License Number</Label>
              <Input
                id="doctorLicense"
                value={formData.doctorLicense}
                onChange={(e) => handleChange("doctorLicense", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prescription Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Medications</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addPrescriptionItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Medication
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {prescriptionItems.map((item, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
              <div className="space-y-2">
                <Label>Medicine *</Label>
                <Select
                  value={item.medicineId}
                  onValueChange={(value) => updatePrescriptionItem(index, "medicineId", value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select medicine" />
                  </SelectTrigger>
                  <SelectContent>
                    {medicines.map((medicine) => (
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
                  onChange={(e) => updatePrescriptionItem(index, "quantity", Number.parseInt(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Instructions</Label>
                <Input
                  value={item.instructions}
                  onChange={(e) => updatePrescriptionItem(index, "instructions", e.target.value)}
                  placeholder="Take twice daily"
                />
              </div>
              <div className="flex items-end">
                {prescriptionItems.length > 1 && (
                  <Button type="button" variant="outline" size="icon" onClick={() => removePrescriptionItem(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Additional Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={3}
          placeholder="Any additional instructions or notes..."
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Prescription...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Create Prescription
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard/prescriptions")}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
