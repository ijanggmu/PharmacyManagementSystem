"use client"

import type React from "react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { customersApi } from "@/features/customers/api-client"
import type { FieldErrorMap } from "@/lib/utils/form-errors"
import { useQueryClient } from "@tanstack/react-query"
import { customerKeys } from "@/features/customers/hooks/use-customers"

interface CreateCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: () => void
}

export default function CreateCustomerModal({ isOpen, onClose, onCreate }: CreateCustomerModalProps) {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    date_of_birth: "",
    emergency_contact: "",
    insurance_provider: "",
    insurance_number: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const getFieldError = (field: string): string | null => fieldErrors[field]?.[0] || null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setFormError(null)
    setFieldErrors({})

    try {
      const insertData = {
        ...formData,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        date_of_birth: formData.date_of_birth || undefined,
        emergency_contact: formData.emergency_contact || undefined,
        insurance_provider: formData.insurance_provider || undefined,
        insurance_number: formData.insurance_number || undefined,
      }

      const { emergency_contact: _emergencyContact, ...apiPayload } = insertData
      const { data, error, fieldErrors: apiFieldErrors } = await customersApi.createCustomer(apiPayload)
      if (error || !data) {
        setFormError(error ?? "Failed to create customer")
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: "Success",
        description: "Customer created successfully",
      })

      setFormData({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        address: "",
        date_of_birth: "",
        emergency_contact: "",
        insurance_provider: "",
        insurance_number: "",
      })
      setFormError(null)
      setFieldErrors({})
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      // Call the onCreate callback
      onCreate()
      onClose()
    } catch (error: any) {
      console.error("Error creating customer:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to create customer. Please check all required fields.",
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
          <DialogTitle>Create New Customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            >
              {formError}
            </div>
          ) : null}

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Personal information
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">
                  First name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="first_name"
                  autoComplete="given-name"
                  value={formData.first_name}
                  onChange={(e) => {
                    setFormData({ ...formData, first_name: e.target.value })
                    setFieldErrors((prev) => ({ ...prev, first_name: [] }))
                  }}
                  required
                  aria-invalid={!!getFieldError("first_name")}
                />
                {getFieldError("first_name") ? (
                  <p className="text-xs text-destructive">{getFieldError("first_name")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">
                  Last name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="last_name"
                  autoComplete="family-name"
                  value={formData.last_name}
                  onChange={(e) => {
                    setFormData({ ...formData, last_name: e.target.value })
                    setFieldErrors((prev) => ({ ...prev, last_name: [] }))
                  }}
                  required
                  aria-invalid={!!getFieldError("last_name")}
                />
                {getFieldError("last_name") ? (
                  <p className="text-xs text-destructive">{getFieldError("last_name")}</p>
                ) : null}
              </div>
            </div>
            <div>
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                autoComplete="bday"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact details
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value })
                    setFieldErrors((prev) => ({ ...prev, email: [] }))
                  }}
                  aria-invalid={!!getFieldError("email")}
                />
                {getFieldError("email") ? (
                  <p className="text-xs text-destructive">{getFieldError("email")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value })
                    setFieldErrors((prev) => ({ ...prev, phone: [] }))
                  }}
                  aria-invalid={!!getFieldError("phone")}
                />
                {getFieldError("phone") ? (
                  <p className="text-xs text-destructive">{getFieldError("phone")}</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact">Emergency contact</Label>
              <Input
                id="emergency_contact"
                autoComplete="tel"
                value={formData.emergency_contact}
                onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                autoComplete="street-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={3}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Insurance <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="insurance_provider">Insurance provider</Label>
                <Input
                  id="insurance_provider"
                  value={formData.insurance_provider}
                  onChange={(e) => setFormData({ ...formData, insurance_provider: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="insurance_number">Insurance number</Label>
                <Input
                  id="insurance_number"
                  value={formData.insurance_number}
                  onChange={(e) => setFormData({ ...formData, insurance_number: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-border/60 pt-5">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Add New Customer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
