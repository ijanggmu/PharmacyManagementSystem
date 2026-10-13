"use client"

import { CreditDaysField } from "@/components/shared/credit-days-field"
import { creditDaysValue, creditTermsLabel, parseCreditDays } from "@/lib/utils/payment-terms"
import type React from "react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DatePicker } from "@/components/ui/date-picker"
import { formatLocalDateYmd } from "@/lib/utils/date"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { customersApi } from "@/features/customers/api-client"
import type { FieldErrorMap } from "@/lib/utils/form-errors"
import { useQueryClient } from "@tanstack/react-query"
import { customerKeys } from "@/features/customers/hooks/use-customers"
import { useCustomerPermissions } from "@/features/customers/hooks/use-customer-permissions"

interface CreateCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: () => void
}

/** "Penicillin, Sulfa drugs" -> ["Penicillin", "Sulfa drugs"] */
const splitList = (value: string): string[] =>
  value.split(",").map((s) => s.trim()).filter(Boolean)

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
    allergies: "",
    chronic_conditions: "",
    current_medications: "",
    credit_limit: "",
    credit_days: "",
    is_member: false,
    sms_consent: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const { toast } = useToast()
  // Setting a credit limit needs Customers.Ledger.Credit (the API refuses it otherwise).
  const { canManageCredit } = useCustomerPermissions()
  const queryClient = useQueryClient()
  const getFieldError = (field: string): string | null => fieldErrors[field]?.[0] || null
  const parsedCreditDays = parseCreditDays(formData.credit_days)
  const creditDaysError = parsedCreditDays.ok ? null : parsedCreditDays.error

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (creditDaysError) return
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
        allergies: splitList(formData.allergies),
        chronic_conditions: splitList(formData.chronic_conditions),
        current_medications: splitList(formData.current_medications),
        credit_limit: canManageCredit && formData.credit_limit.trim() !== "" ? Number(formData.credit_limit) : null,
        credit_days: canManageCredit ? creditDaysValue(formData.credit_days) : null,
      }

      const { emergency_contact: _emergencyContact, ...apiPayload } = insertData
      const { data, error, fieldErrors: apiFieldErrors } = await customersApi.createCustomer(apiPayload)
      if (error || !data) {
        setFormError(error ?? "Failed to create customer")
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: "Customer added",
        description: `${formData.first_name} ${formData.last_name} can now be selected at checkout.`,
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
        allergies: "",
        chronic_conditions: "",
        current_medications: "",
        credit_limit: "",
        credit_days: "",
        is_member: false,
        sms_consent: false,
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
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>Only the name is required. Phone and allergies help at the counter.</DialogDescription>
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
            <div>
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <DatePicker
                id="date_of_birth"
                value={formData.date_of_birth}
                onChange={(v) => setFormData({ ...formData, date_of_birth: v })}
                max={formatLocalDateYmd(new Date())}
                defaultMonth="1990-01-01"
                clearable
                className="mt-1.5"
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
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Switch
                checked={formData.sms_consent}
                onCheckedChange={(sms_consent) => setFormData({ ...formData, sms_consent })}
                aria-describedby="sms_consent-hint"
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">SMS reminders</span>
                <span id="sms_consent-hint" className="block text-xs text-muted-foreground">
                  The customer agreed to refill and payment reminders by SMS. Turn off if they reply STOP.
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
              <p className="text-xs text-muted-foreground">
                No credit limit or payment terms ({creditTermsLabel(null).toLowerCase()}). A manager can set them later (needs the Manage Customer Credit Limits permission).
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Medical information <span className="font-normal normal-case text-muted-foreground/70">(optional — used to warn against interactions/allergies at checkout)</span>
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Input
                id="allergies"
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder="e.g. Penicillin, Sulfa drugs"
                aria-describedby="allergies-help"
              />
              <p id="allergies-help" className="text-xs text-muted-foreground">
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
            <Button type="submit" loading={isLoading} loadingText="Adding customer…">
              Add customer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
