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
import { suppliersApi } from "@/features/suppliers/api-client"
import type { FieldErrorMap } from "@/lib/utils/form-errors"
import { useQueryClient } from "@tanstack/react-query"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  reconciliation_account_ref?: string | null
}

interface EditSupplierModalProps {
  supplier: Supplier | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function EditSupplierModal({ supplier, isOpen, onClose, onUpdate }: EditSupplierModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    reconciliation_account_ref: "",
    address: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const getFieldError = (field: string): string | null => fieldErrors[field]?.[0] || null

  useEffect(() => {
    if (supplier && isOpen) {
      setFormData({
        name: supplier.name,
        contact_person: supplier.contact_person || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        reconciliation_account_ref: supplier.reconciliation_account_ref || "",
        address: supplier.address || "",
      })
      setFormError(null)
      setFieldErrors({})
    } else if (!isOpen) {
      // Reset form when modal closes
      setFormData({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        reconciliation_account_ref: "",
        address: "",
      })
      setFormError(null)
      setFieldErrors({})
    }
  }, [supplier, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplier) return

    setIsLoading(true)
    setFormError(null)
    setFieldErrors({})

    try {
      const updateData = {
        ...formData,
        contact_person: formData.contact_person || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        reconciliation_account_ref: formData.reconciliation_account_ref.trim() || null,
      }

      const { data, error, fieldErrors: apiFieldErrors } = await suppliersApi.updateSupplier(
        supplier.id,
        updateData
      )
      if (error || !data) {
        setFormError(error ?? "Failed to update supplier")
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: "Success",
        description: "Supplier updated successfully",
      })

      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      onUpdate()
      onClose()
    } catch (error) {
      console.error("Error updating supplier:", error)
      const fallback = error instanceof Error ? error.message : "Failed to update supplier"
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

  if (!supplier) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Edit Supplier</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {formError}
            </div>
          ) : null}
          <div>
            <Label htmlFor="name">Supplier Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value })
                setFieldErrors((prev) => ({ ...prev, name: [] }))
              }}
              required
            />
            {getFieldError("name") ? (
              <p className="mt-1 text-xs text-destructive">{getFieldError("name")}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="contact_person">Contact Person</Label>
            <Input
              id="contact_person"
              value={formData.contact_person}
              onChange={(e) => {
                setFormData({ ...formData, contact_person: e.target.value })
                setFieldErrors((prev) => ({ ...prev, contact_person: [] }))
              }}
            />
            {getFieldError("contact_person") ? (
              <p className="mt-1 text-xs text-destructive">{getFieldError("contact_person")}</p>
            ) : null}
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
            <Label htmlFor="reconciliation_account_ref">Statement / account reference</Label>
            <Input
              id="reconciliation_account_ref"
              placeholder="Your account number on the supplier's invoices"
              value={formData.reconciliation_account_ref}
              onChange={(e) =>
                {
                  setFormData({ ...formData, reconciliation_account_ref: e.target.value })
                  setFieldErrors((prev) => ({ ...prev, reconciliation_account_ref: [] }))
                }
              }
              maxLength={150}
            />
            {getFieldError("reconciliation_account_ref") ? (
              <p className="mt-1 text-xs text-destructive">{getFieldError("reconciliation_account_ref")}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => {
                setFormData({ ...formData, address: e.target.value })
                setFieldErrors((prev) => ({ ...prev, address: [] }))
              }}
              rows={3}
            />
            {getFieldError("address") ? (
              <p className="mt-1 text-xs text-destructive">{getFieldError("address")}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Supplier
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
