"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useInventory } from "@/features/medicines/hooks/use-inventory"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"
import { DUPLICATE_MEDICINE_MESSAGE, hasDuplicateMedicines } from "@/features/prescriptions/lib/prescription-items"
import { customersApi } from "@/features/customers/api-client"
import { prescriptionsApi } from "@/features/prescriptions/api-client"
import { addDaysYmd, nepalYmdOf } from "@/lib/utils/nepal-time"

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
      // The pharmacy's calendar day (Nepal), not the UTC date: between 18:15 and 24:00 UTC they differ.
      const today = nepalYmdOf()
      setFormData((prev) => ({
        ...prev,
        // The server assigns the RX- number on save; a made-up preview here never matched the saved one.
        prescription_number: "",
        issue_date: today,
        expiry_date: addDaysYmd(today, 180), // standard validity window; editable below
        customer_id: selectedCustomerId || "",
      }))
      setItems([])
    }
  }, [isOpen, selectedCustomerId])

  // A controlled (narcotic/scheduled) medicine on the prescription makes the doctor's NMC number mandatory:
  // it is a column of the DDA narcotic register, and the server refuses the prescription without it.
  const hasControlledItem = items.some(
    (item) => medicines?.data?.find((m) => m.id === item.medicine_id)?.controlled_substance,
  )

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

  const handleItemChange = <K extends keyof PrescriptionItem>(index: number, field: K, value: PrescriptionItem[K]) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const loadCustomers = async () => {
    const { data, error } = await customersApi.getCustomers({ limit: 1000, sortBy: "first_name", sortOrder: "asc" })
    if (!error) {
      setCustomers(
        (data || []).map((c) => ({
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

    if (hasDuplicateMedicines(items)) {
      toast({ title: "Duplicate medicine", description: DUPLICATE_MEDICINE_MESSAGE, variant: "destructive" })
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
        doctor_license: formData.doctor_license || null,
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
        title: "Prescription not saved",
        // The server's reason (e.g. a controlled medicine without the doctor's NMC number), not a generic line.
        description: error instanceof Error && error.message ? error.message : "Failed to create prescription",
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
          <DialogTitle>New prescription</DialogTitle>
          <DialogDescription>
            Fields marked <span className="text-destructive">*</span> are required. Add every medicine the doctor prescribed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="prescription_number">Prescription number</Label>
              <Input
                id="prescription_number"
                value={formData.prescription_number}
                placeholder="Assigned when saved"
                readOnly
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">The next RX number is given automatically when you save.</p>
            </div>
            <div>
              <Label htmlFor="customer_id">
                Patient {selectedCustomerId ? "(pre-selected)" : <span className="text-destructive" aria-hidden>*</span>}
              </Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                disabled={!!selectedCustomerId}
                required
              >
                <SelectTrigger id="customer_id">
                  <SelectValue placeholder={selectedCustomerId ? "Patient selected" : "Select patient"} />
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
                <p className="text-xs text-muted-foreground mt-1">Choose an existing customer record.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="doctor_name">Doctor name <span className="text-destructive" aria-hidden>*</span></Label>
              <Input
                id="doctor_name"
                value={formData.doctor_name}
                onChange={(e) => setFormData({ ...formData, doctor_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="doctor_license">
                Doctor license no. (NMC){hasControlledItem && <span className="text-destructive" aria-hidden> *</span>}
              </Label>
              <Input
                id="doctor_license"
                value={formData.doctor_license}
                onChange={(e) => setFormData({ ...formData, doctor_license: e.target.value })}
                required={hasControlledItem}
                aria-required={hasControlledItem}
                maxLength={64}
                aria-describedby="doctor_license-hint"
              />
              <p id="doctor_license-hint" className="text-xs text-muted-foreground mt-1">
                {hasControlledItem
                  ? "Required: a controlled medicine is on this prescription (recorded in the narcotic register)."
                  : "Required when a controlled medicine is prescribed."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="issue_date">Issue date <span className="text-destructive" aria-hidden>*</span></Label>
              <DatePicker
                id="issue_date"
                value={formData.issue_date}
                onChange={(v) => setFormData({ ...formData, issue_date: v })}
                aria-required
              />
            </div>
            <div>
              <Label htmlFor="expiry_date">Valid until</Label>
              <DatePicker
                id="expiry_date"
                value={formData.expiry_date}
                onChange={(v) => setFormData({ ...formData, expiry_date: v })}
                min={formData.issue_date || undefined}
                allowFuture
                clearable
                aria-describedby="expiry_date-help"
              />
              <p id="expiry_date-help" className="mt-1 text-xs text-muted-foreground">
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
              <h3 className="text-sm font-medium leading-none">
                Prescribed medicines <span className="text-destructive" aria-hidden>*</span>
              </h3>
              {items.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add medicine
                </Button>
              )}
            </div>
            {items.length === 0 && (
              <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground">
                <p className="text-sm mb-2">No medicines yet. Add at least one to save.</p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add first medicine
                </Button>
              </div>
            )}
            {items.map((item, index) => (
              <div
                key={index}
                role="group"
                aria-label={`Medicine ${index + 1}`}
                className="mb-3 space-y-3 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Medicine {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveItem(index)}
                    aria-label={`Remove medicine ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_130px]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`rx-item-medicine-${index}`}>Medicine</Label>
                    <MedicineCombobox
                      id={`rx-item-medicine-${index}`}
                      medicines={medicines?.data}
                      value={item.medicine_id}
                      onValueChange={(value) => handleItemChange(index, "medicine_id", value)}
                      placeholder="Search medicine"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`cp-qty-${index}`}>Qty prescribed</Label>
                    <Input
                      id={`cp-qty-${index}`}
                      type="number"
                      inputMode="numeric"
                      value={item.quantity_prescribed}
                      onChange={(e) => handleItemChange(index, "quantity_prescribed", Number.parseInt(e.target.value))}
                      min="1"
                      className="num text-right"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cp-dosage-${index}`}>
                    Dosage instructions <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <Input
                    id={`cp-dosage-${index}`}
                    value={item.dosage_instructions}
                    onChange={(e) => handleItemChange(index, "dosage_instructions", e.target.value)}
                    placeholder="e.g. 1 tablet twice daily after meals"
                    required
                  />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Saving prescription…">
              Save prescription
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
