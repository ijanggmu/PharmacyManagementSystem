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
import { CreateSupplierInput, suppliersApi } from "@/features/suppliers/api-client"
import type { FieldErrorMap } from "@/lib/utils/form-errors"
import { useQueryClient } from "@tanstack/react-query"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { supplierNameSchema } from "@/lib/utils/validation"
import ConfirmNewSupplierDialog from "@/features/suppliers/components/confirm-new-supplier-dialog"

interface CreateSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: () => void
}

export default function CreateSupplierModal({ isOpen, onClose, onCreate }: CreateSupplierModalProps) {
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
  const [supplierPendingConfirm, setSupplierPendingConfirm] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const getFieldError = (field: string): string | null => fieldErrors[field]?.[0] || null

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setIsLoading(true)
    setFormError(null)
    setFieldErrors({})

    const nameCheck = supplierNameSchema.safeParse(formData.name)
    if (!nameCheck.success) {
      const message = nameCheck.error.issues[0]?.message || "Supplier name is invalid"
      setFieldErrors({ name: [message] })
      setFormError(message)
      setIsLoading(false)
      return
    }

    if (supplierPendingConfirm !== nameCheck.data) {
      setSupplierPendingConfirm(nameCheck.data)
      setIsLoading(false)
      return
    }

    try {
      const insertData: CreateSupplierInput = {
        name: nameCheck.data,
        contact_person: formData.contact_person || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        reconciliation_account_ref: formData.reconciliation_account_ref.trim() || null,
      }

      const { data, error, fieldErrors: apiFieldErrors } = await suppliersApi.createSupplier(insertData)
      if (error || !data) {
        setFormError(error ?? "Failed to create supplier")
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: "Success",
        description: "Supplier created successfully",
      })

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
      setSupplierPendingConfirm(null)
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      // Call the onCreate callback
      onCreate()
      onClose()
    } catch (error) {
      console.error("Error creating supplier:", error)
      const fallback = error instanceof Error ? error.message : "Failed to create supplier"
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Create New Supplier</DialogTitle>
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
              placeholder="Your account number on the supplier's invoices (for reconciliation)"
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
              Add New Supplier
            </Button>
          </div>
        </form>
      </DialogContent>
      <ConfirmNewSupplierDialog
        open={supplierPendingConfirm !== null}
        supplierNames={supplierPendingConfirm ? [supplierPendingConfirm] : []}
        confirming={isLoading}
        onOpenChange={(open) => {
          if (!open) setSupplierPendingConfirm(null)
        }}
        onConfirm={() => void handleSubmit()}
      />
    </Dialog>
  )
}
