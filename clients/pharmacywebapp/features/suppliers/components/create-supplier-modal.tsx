"use client"

import type React from "react"
import { useState } from "react"
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
import { CreateSupplierInput, suppliersApi } from "@/features/suppliers/api-client"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { creditDaysValue } from "@/lib/utils/payment-terms"
import ConfirmNewSupplierDialog from "@/features/suppliers/components/confirm-new-supplier-dialog"
import {
  EMPTY_SUPPLIER_FORM,
  SupplierFormFields,
  supplierErrorsFromApi,
  validateSupplierForm,
  type SupplierFormErrors,
  type SupplierFormValues,
} from "./supplier-form-fields"

interface CreateSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: () => void
}

export default function CreateSupplierModal({ isOpen, onClose, onCreate }: CreateSupplierModalProps) {
  const [values, setValues] = useState<SupplierFormValues>(EMPTY_SUPPLIER_FORM)
  const [errors, setErrors] = useState<SupplierFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [supplierPendingConfirm, setSupplierPendingConfirm] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const reset = () => {
    setValues(EMPTY_SUPPLIER_FORM)
    setErrors({})
    setFormError(null)
    setSupplierPendingConfirm(null)
  }

  const handleClose = () => {
    if (isLoading) return
    reset()
    onClose()
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError(null)
    const clientErrors = validateSupplierForm(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    const name = values.name.trim()
    // Ask once before creating, so a typo doesn't quietly add a near-duplicate supplier.
    if (supplierPendingConfirm !== name) {
      setSupplierPendingConfirm(name)
      return
    }

    setIsLoading(true)
    try {
      const input: CreateSupplierInput = {
        name,
        tax_id: values.tax_id.trim() || undefined,
        contact_person: values.contact_person.trim() || undefined,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        address: values.address.trim() || undefined,
        credit_days: creditDaysValue(values.credit_days),
      }
      const { data, error, fieldErrors } = await suppliersApi.createSupplier(input)
      if (error || !data) {
        setFormError(error ?? "Failed to create supplier")
        setErrors(supplierErrorsFromApi(fieldErrors))
        setSupplierPendingConfirm(null)
        return
      }

      toast({ title: "Supplier added", description: `${data.name} is ready to use on bills and purchase orders.` })
      void queryClient.invalidateQueries({ queryKey: supplierKeys.lists() })
      reset()
      onCreate()
      onClose()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create supplier")
      setSupplierPendingConfirm(null)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Add supplier</DialogTitle>
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
              idPrefix="create-supplier"
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
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Adding…">
              Add supplier
            </Button>
          </DialogStickyFooter>
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
