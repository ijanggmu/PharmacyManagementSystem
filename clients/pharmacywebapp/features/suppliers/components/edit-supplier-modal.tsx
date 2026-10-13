"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { DetailSheet } from "@/components/ui/detail-sheet"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { suppliersApi, type Supplier } from "@/features/suppliers/api-client"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { creditDaysValue } from "@/lib/utils/payment-terms"
import {
  EMPTY_SUPPLIER_FORM,
  SupplierFormFields,
  supplierErrorsFromApi,
  validateSupplierForm,
  type SupplierFormErrors,
  type SupplierFormValues,
} from "./supplier-form-fields"

interface EditSupplierModalProps {
  supplier: Pick<Supplier, "id" | "name" | "contact_person" | "email" | "phone" | "address" | "tax_id" | "is_active" | "credit_days"> | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
  /** Shown as "Back" when edit was opened from the supplier's details panel. */
  onBack?: () => void
}

export default function EditSupplierModal({ supplier, isOpen, onClose, onUpdate, onBack }: EditSupplierModalProps) {
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
        credit_days: supplier.credit_days == null ? "" : String(supplier.credit_days),
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
        credit_days: creditDaysValue(values.credit_days),
      })
      if (error || !data) {
        setFormError(error ?? "Failed to update supplier")
        setErrors(supplierErrorsFromApi(fieldErrors))
        return
      }

      toast({ title: "Supplier updated", description: `${data.name} was saved.` })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
      onUpdate()
      ;(onBack ?? onClose)()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update supplier")
    } finally {
      setIsLoading(false)
    }
  }

  if (!supplier) return null

  const formId = "edit-supplier-form"

  // Opens in the same right-side panel as the supplier's details, so the list stays in view.
  return (
    <DetailSheet
      open={isOpen}
      onOpenChange={(open) => !open && !isLoading && onClose()}
      size="md"
      title="Edit supplier"
      description={
        <>
          {supplier.name} · Fields marked <span className="text-destructive">*</span> are required.
        </>
      }
      onBack={onBack && !isLoading ? onBack : undefined}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onBack ?? onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isLoading} loadingText="Saving…">
            Save changes
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
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
      </form>
    </DetailSheet>
  )
}
