"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface CreatePrescriptionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedCustomerId?: string
}

export default function CreatePrescriptionModal({ isOpen, onClose, onSuccess, selectedCustomerId }: CreatePrescriptionModalProps) {
  const [formData, setFormData] = useState({
    prescription_number: "",
    customer_id: "",
    doctor_name: "",
    doctor_license: "",
    issue_date: "",
    notes: "",
    status: "pending",
  })
  const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      loadCustomers()
      // Generate prescription number
      setFormData((prev) => ({
        ...prev,
        prescription_number: `RX${Date.now()}`,
        issue_date: new Date().toISOString().split("T")[0],
        customer_id: selectedCustomerId || "",
      }))
    }
  }, [isOpen, selectedCustomerId])

  const loadCustomers = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("customers").select("id, first_name, last_name").order("first_name")

    if (data) setCustomers(data)
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
    
    setIsLoading(true)
    const supabase = createClient()

    try {
      const { data, error } = await supabase.from("prescriptions").insert([
        {
          ...formData,
          customer_id: formData.customer_id,
        },
      ]).select().single()

      if (error) throw error

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
        notes: "",
        status: "pending",
      })
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
      <DialogContent className="max-w-2xl">
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
                onChange={(e) => setFormData({ ...formData, prescription_number: e.target.value })}
                required
              />
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
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
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
