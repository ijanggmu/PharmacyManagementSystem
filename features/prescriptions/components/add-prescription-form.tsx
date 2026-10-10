"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useCreatePrescription } from "@/features/prescriptions/hooks/use-prescriptions"
import { useCustomers } from "@/features/customers/hooks/use-customers"
import { useInventory } from "@/features/medicines/hooks/use-inventory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Pill, Plus, Stethoscope, Trash2 } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { MedicineCombobox } from "@/features/medicines/components/medicine-combobox"

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

  const handleItemChange = <K extends keyof PrescriptionItem>(index: number, field: K, value: PrescriptionItem[K]) => {
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
        prescription_items: formData.items.map(item => ({
          medicine_id: item.medicine_id,
          quantity_prescribed: item.quantity_prescribed,
          quantity_dispensed: item.quantity_dispensed,
          dosage_instructions: item.dosage_instructions,
        })),
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

  const isPage = !onSuccess
  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-card px-3 py-1.5 text-base shadow-xs transition-[color,box-shadow,border-color] duration-150 outline-none hover:border-primary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-9 md:text-sm"

  const required = (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  )

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", isPage && "pb-24")}>
      <p className="text-sm text-muted-foreground">
        Fields marked <span className="text-destructive">*</span> are required.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-muted-foreground" aria-hidden />
            Patient and prescriber
          </CardTitle>
          <CardDescription>Who the prescription is for and who wrote it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rx-number">Prescription number{required}</Label>
              <Input
                id="rx-number"
                name="prescription_number"
                value={formData.prescription_number}
                onChange={handleInputChange}
                placeholder="RX-001"
                aria-describedby="rx-number-help"
                className="num"
                required
              />
              <p id="rx-number-help" className="text-xs text-muted-foreground">
                The number written on the paper prescription, or your own reference.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rx-customer">Patient{required}</Label>
              <select
                id="rx-customer"
                name="customer_id"
                value={formData.customer_id}
                onChange={handleInputChange}
                className={selectClass}
                required
              >
                <option value="">Select patient</option>
                {customers?.data?.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.first_name} {customer.last_name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Not listed? Add them under{" "}
                <Link href="/dashboard/customers" className="font-medium text-primary underline-offset-4 hover:underline">
                  Customers
                </Link>{" "}
                first.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rx-doctor">Doctor name{required}</Label>
              <Input
                id="rx-doctor"
                name="doctor_name"
                value={formData.doctor_name}
                onChange={handleInputChange}
                placeholder="Dr. Sharma"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rx-date">Prescribed date{required}</Label>
              <DatePicker
                id="rx-date"
                value={formData.prescribed_date}
                onChange={(v) => setFormData((prev) => ({ ...prev, prescribed_date: v }))}
                max={formatLocalDateYmd(new Date())}
                aria-required
                aria-describedby="rx-date-help"
              />
              <p id="rx-date-help" className="text-xs text-muted-foreground">The date the doctor wrote the prescription.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rx-notes">Notes</Label>
            <Textarea
              id="rx-notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Allergies, diagnosis, or anything the next pharmacist should know"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Pill className="h-4 w-4 text-muted-foreground" aria-hidden />
              Prescribed medicines{required}
            </CardTitle>
            <CardDescription>
              Add each medicine with the quantity prescribed. Dispensing is recorded later at the counter.
            </CardDescription>
          </div>
          {formData.items.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="h-4 w-4" aria-hidden />
              Add medicine
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.items.length === 0 && (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                No medicines yet. Add at least one to save this prescription.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4" aria-hidden />
                Add first medicine
              </Button>
            </div>
          )}
          {formData.items.map((item, index) => (
            <div key={index} role="group" aria-label={`Medicine ${index + 1}`} className="space-y-3 rounded-lg border p-3 sm:p-4">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <div className="space-y-1.5">
                  <Label htmlFor={`rx-line-medicine-${index}`}>Medicine{required}</Label>
                  <MedicineCombobox
                    id={`rx-line-medicine-${index}`}
                    medicines={medicines?.data}
                    value={item.medicine_id}
                    onValueChange={(value) => handleItemChange(index, "medicine_id", value)}
                    placeholder="Search medicine"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rx-qty-${index}`}>Qty prescribed{required}</Label>
                  <Input
                    id={`rx-qty-${index}`}
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
                <Label htmlFor={`rx-dosage-${index}`}>Dosage instructions{required}</Label>
                <Input
                  id={`rx-dosage-${index}`}
                  value={item.dosage_instructions}
                  onChange={(e) => handleItemChange(index, "dosage_instructions", e.target.value)}
                  placeholder="e.g. 1 tablet twice daily after meals for 5 days"
                  required
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
          isPage &&
            "sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:px-4"
        )}
      >
        {isPage && (
          <p className="mr-auto hidden text-sm text-muted-foreground sm:block">
            <span className="num">{formData.items.length}</span>{" "}
            {formData.items.length === 1 ? "medicine" : "medicines"} added
          </p>
        )}
        {isPage && (
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/prescriptions">Cancel</Link>
          </Button>
        )}
        <Button type="submit" loading={createMutation.isPending} loadingText="Saving prescription…">
          Save prescription
        </Button>
      </div>
    </form>
  )
}
