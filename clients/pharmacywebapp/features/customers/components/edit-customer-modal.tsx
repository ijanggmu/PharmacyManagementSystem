"use client"

import { CreditDaysField } from "@/components/shared/credit-days-field"
import { creditDaysValue, creditTermsLabel, parseCreditDays } from "@/lib/utils/payment-terms"
import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DatePicker } from "@/components/ui/date-picker"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Customer } from "@/features/customers/api-client"
import { customersApi } from "@/features/customers/api-client"
import type { FieldErrorMap } from "@/lib/utils/form-errors"
import { useQueryClient } from "@tanstack/react-query"
import { customerKeys } from "@/features/customers/hooks/use-customers"
import { useCustomerPermissions } from "@/features/customers/hooks/use-customer-permissions"
import { CurrencyDisplay } from "@/components/currency-display"

interface EditCustomerModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

/** "Penicillin, Sulfa drugs" -> ["Penicillin", "Sulfa drugs"] */
const splitList = (value: string): string[] =>
  value.split(",").map((s) => s.trim()).filter(Boolean)

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
    allergies: "",
    chronic_conditions: "",
    current_medications: "",
    credit_limit: "",
    credit_days: "",
    is_member: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const { toast } = useToast()
  // Changing the credit limit needs Customers.Ledger.Credit; without it the stored limit is kept as is.
  const { canManageCredit } = useCustomerPermissions()
  const queryClient = useQueryClient()
  const getFieldError = (field: string): string | null => fieldErrors[field]?.[0] || null
  const parsedCreditDays = parseCreditDays(formData.credit_days)
  const creditDaysError = parsedCreditDays.ok ? null : parsedCreditDays.error

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
        allergies: (customer.allergies || []).join(", "),
        chronic_conditions: (customer.chronic_conditions || []).join(", "),
        current_medications: (customer.current_medications || []).join(", "),
        credit_limit: customer.credit_limit != null ? String(customer.credit_limit) : "",
        credit_days: customer.credit_days != null ? String(customer.credit_days) : "",
        is_member: customer.is_member === true,
      })
      setFormError(null)
      setFieldErrors({})
    }
  }, [customer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer || creditDaysError) return

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
        allergies: splitList(formData.allergies),
        chronic_conditions: splitList(formData.chronic_conditions),
        current_medications: splitList(formData.current_medications),
        // Blank removes the limit. Without the credit permission the limit isn't sent at all (kept).
        credit_limit: canManageCredit
          ? formData.credit_limit.trim() === "" ? null : Number(formData.credit_limit)
          : undefined,
        // Same for the payment terms: blank removes them; without the permission they are kept.
        credit_days: canManageCredit ? creditDaysValue(formData.credit_days) : undefined,
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
        title: "Changes saved",
        description: `${formData.first_name} ${formData.last_name} has been updated.`,
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
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            {customer ? `Update details for ${customer.first_name} ${customer.last_name}.` : "Update customer details."}
          </DialogDescription>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <DatePicker
                id="date_of_birth"
                value={formData.date_of_birth}
                onChange={(v) => setFormData({ ...formData, date_of_birth: v })}
                max={formatLocalDateYmd(new Date())}
                defaultMonth="1990-01-01"
                clearable
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact details
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              Credit &amp; loyalty <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
            </legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Switch
                checked={formData.is_member}
                onCheckedChange={(is_member) => setFormData({ ...formData, is_member })}
                aria-describedby="is_member-hint"
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">Loyalty member</span>
                <span id="is_member-hint" className="block text-xs text-muted-foreground">
                  Earns points on purchases and gets the member discount, when the loyalty programme is on.
                </span>
              </span>
            </label>
            {canManageCredit ? (
            <>
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="credit_limit">Credit limit</Label>
              <Input
                id="credit_limit"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={formData.credit_limit}
                onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                placeholder="No limit"
                aria-describedby="credit_limit-hint"
                aria-invalid={!!(getFieldError("creditLimit") || getFieldError("credit_limit"))}
              />
              <p id="credit_limit-hint" className="text-xs text-muted-foreground">
                Most this customer may owe on credit sales. Leave blank for no limit.
              </p>
              {(getFieldError("creditLimit") || getFieldError("credit_limit")) && (
                <p className="text-xs text-destructive" role="alert">
                  {getFieldError("creditLimit") || getFieldError("credit_limit")}
                </p>
              )}
            </div>
              <CreditDaysField
                id="credit_days"
                value={formData.credit_days}
                onChange={(credit_days) => setFormData({ ...formData, credit_days })}
                error={creditDaysError ?? getFieldError("creditDays") ?? undefined}
                hint="A sale on account falls due this many days after the sale. Blank = no terms."
              />
            </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Credit limit:{" "}
                {customer.credit_limit != null ? (
                  <CurrencyDisplay amount={customer.credit_limit} className="font-medium text-foreground" />
                ) : (
                  <span className="font-medium text-foreground">no limit</span>
                )}
                ; payment terms: {creditTermsLabel(customer.credit_days)}. Only users with the Manage Customer Credit Limits
                permission can change them.
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Medical information{" "}
              <span className="font-normal normal-case text-muted-foreground/70">
                (optional — used to warn against interactions/allergies at checkout)
              </span>
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Input
                id="allergies"
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder="e.g. Penicillin, Sulfa drugs"
                aria-describedby="edit-allergies-help"
              />
              <p id="edit-allergies-help" className="text-xs text-muted-foreground">
                Separate with commas. Checkout warns if the cart contains a matching medicine.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="chronic_conditions">Chronic conditions</Label>
                <Input
                  id="chronic_conditions"
                  value={formData.chronic_conditions}
                  onChange={(e) => setFormData({ ...formData, chronic_conditions: e.target.value })}
                  placeholder="e.g. Diabetes, Hypertension"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current_medications">Current medications</Label>
                <Input
                  id="current_medications"
                  value={formData.current_medications}
                  onChange={(e) => setFormData({ ...formData, current_medications: e.target.value })}
                  placeholder="e.g. Warfarin, Metformin"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Insurance <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-5">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Saving…">
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
