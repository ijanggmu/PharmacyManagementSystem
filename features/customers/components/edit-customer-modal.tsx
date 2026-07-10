"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { Customer } from "@/features/customers/api-client"
import { customersApi } from "@/features/customers/api-client"
import type { FieldErrorMap } from "@/lib/utils/form-errors"
import { useQueryClient } from "@tanstack/react-query"
import { customerKeys } from "@/features/customers/hooks/use-customers"

interface EditCustomerModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function EditCustomerModal({ customer, isOpen, onClose, onUpdate }: EditCustomerModalProps) {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    date_of_birth: "",
    insurance_provider: "",
    insurance_number: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const getFieldError = (field: string): string | null => fieldErrors[field]?.[0] || null

  useEffect(() => {
    if (customer) {
      setFormData({
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        date_of_birth: customer.date_of_birth || "",
        insurance_provider: customer.insurance_provider || "",
        insurance_number: customer.insurance_number || "",
      })
      setFormError(null)
      setFieldErrors({})
    }
  }, [customer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer) return

    setIsLoading(true)
    setFormError(null)
    setFieldErrors({})

    try {
      const updateData = {
        ...formData,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        date_of_birth: formData.date_of_birth || null,
        insurance_provider: formData.insurance_provider || null,
        insurance_number: formData.insurance_number || null,
      }

      const { data, error, fieldErrors: apiFieldErrors } = await customersApi.updateCustomer(
        customer.id,
        updateData
      )
      if (error || !data) {
        setFormError(error ?? "Failed to update customer")
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: "Success",
        description: "Customer updated successfully",
      })

      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      onUpdate()
      onClose()
    } catch (error) {
      console.error("Error updating customer:", error)
      const fallback = error instanceof Error ? error.message : "Failed to update customer"
      setFormError(fallback)
      toast({
        title: "Error",
        description: fallback,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!customer) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {formError}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => {
                  setFormData({ ...formData, first_name: e.target.value })
                  setFieldErrors((prev) => ({ ...prev, first_name: [] }))
                }}
                required
              />
              {getFieldError("first_name") ? (
                <p className="mt-1 text-xs text-destructive">{getFieldError("first_name")}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => {
                  setFormData({ ...formData, last_name: e.target.value })
                  setFieldErrors((prev) => ({ ...prev, last_name: [] }))
                }}
                required
              />
              {getFieldError("last_name") ? (
                <p className="mt-1 text-xs text-destructive">{getFieldError("last_name")}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value })
                  setFieldErrors((prev) => ({ ...prev, email: [] }))
                }}
              />
              {getFieldError("email") ? (
                <p className="mt-1 text-xs text-destructive">{getFieldError("email")}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value })
                  setFieldErrors((prev) => ({ ...prev, phone: [] }))
                }}
              />
              {getFieldError("phone") ? (
                <p className="mt-1 text-xs text-destructive">{getFieldError("phone")}</p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input
              id="date_of_birth"
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="insurance_provider">Insurance Provider</Label>
              <Input
                id="insurance_provider"
                value={formData.insurance_provider}
                onChange={(e) => setFormData({ ...formData, insurance_provider: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="insurance_number">Insurance Number</Label>
              <Input
                id="insurance_number"
                value={formData.insurance_number}
                onChange={(e) => setFormData({ ...formData, insurance_number: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Customer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
