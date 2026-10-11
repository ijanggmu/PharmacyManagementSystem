"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import {
  EMPTY_SUPPLIER_FORM,
  SupplierFormFields,
  supplierErrorsFromApi,
  validateSupplierForm,
  type SupplierFormErrors,
  type SupplierFormValues,
} from "./supplier-form-fields"

interface EditSupplierModalProps {
  supplier: Pick<Supplier, "id" | "name" | "contact_person" | "email" | "phone" | "address" | "tax_id" | "is_active"> | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export default function EditSupplierModal({ supplier, isOpen, onClose, onUpdate }: EditSupplierModalProps) {
  const [values, setValues] = useState<SupplierFormValues>(EMPTY_SUPPLIER_FORM)
  const [errors, setErrors] = useState<SupplierFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (supplier && isOpen) {
      setValues({
        name: supplier.name,
        tax_id: supplier.tax_id ?? "",
        contact_person: supplier.contact_person ?? "",
        phone: supplier.phone ?? "",
        email: supplier.email ?? "",
        address: supplier.address ?? "",
        is_active: supplier.is_active !== false,
      })
    }
    if (!isOpen) setValues(EMPTY_SUPPLIER_FORM)
    setErrors({})
    setFormError(null)
  }, [supplier, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplier) return
    setFormError(null)
    const clientErrors = validateSupplierForm(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setIsLoading(true)
    try {
      const { data, error, fieldErrors } = await suppliersApi.updateSupplier(supplier.id, {
        name: values.name.trim(),
        tax_id: values.tax_id.trim() || null,
        contact_person: values.contact_person.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        address: values.address.trim() || null,
        is_active: values.is_active,
      })
      if (error || !data) {
        setFormError(error ?? "Failed to update supplier")
        setErrors(supplierErrorsFromApi(fieldErrors))
        return
      }

      toast({ title: "Supplier updated", description: `${data.name} was saved.` })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
      onUpdate()
      onClose()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update supplier")
    } finally {
      setIsLoading(false)
    }
  }

  if (!supplier) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Edit supplier</DialogTitle>
          <DialogDescription>
            Fields marked <span className="text-destructive">*</span> are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogScrollBody>
            {formError && (
              <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}
            <SupplierFormFields
              idPrefix="edit-supplier"
              showActive
              values={values}
              errors={errors}
              onChange={(patch) => {
                setValues((v) => ({ ...v, ...patch }))
                setErrors((e) => {
                  const next = { ...e }
                  for (const key of Object.keys(patch) as (keyof SupplierFormValues)[]) delete next[key]
                  return next
                })
              }}
            />
          </DialogScrollBody>
          <DialogStickyFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Saving…">
              Save changes
            </Button>
          </DialogStickyFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
