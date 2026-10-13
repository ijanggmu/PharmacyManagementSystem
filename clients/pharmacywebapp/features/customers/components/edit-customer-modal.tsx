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
import { useTranslations } from "@/lib/i18n/i18n-provider"
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
    sms_consent: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const { toast } = useToast()
  const t = useTranslations("customers")
  const tc = useTranslations("common")
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
        sms_consent: customer.sms_consent === true,
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
        setFormError(error ?? t("toasts.updateFailed"))
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: t("toasts.saved"),
        description: t("toasts.savedDescription", { name: `${formData.first_name} ${formData.last_name}` }),
      })

      queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      onUpdate()
      onClose()
    } catch (error) {
      console.error("Error updating customer:", error)
      const fallback = error instanceof Error ? error.message : t("toasts.updateFailed")
      setFormError(fallback)
      toast({
        title: t("toasts.error"),
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
          <DialogTitle>{t("form.editTitle")}</DialogTitle>
          <DialogDescription>
            {customer ? t("form.editDescription", { name: `${customer.first_name} ${customer.last_name}` }) : t("form.editDescriptionGeneric")}
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
              {t("form.personal")}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">
                  {t("form.firstName")} <span className="text-destructive">*</span>
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
                  {t("form.lastName")} <span className="text-destructive">*</span>
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
              <Label htmlFor="date_of_birth">{t("form.dateOfBirth")}</Label>
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
              {t("form.contactDetails")}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("form.email")}</Label>
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
                <Label htmlFor="phone">{t("form.phone")}</Label>
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
              <Label htmlFor="address">{t("form.address")}</Label>
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
              {t("form.creditLoyalty")} <span className="font-normal normal-case text-muted-foreground/70">{t("form.optional")}</span>
            </legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Switch
                checked={formData.is_member}
                onCheckedChange={(is_member) => setFormData({ ...formData, is_member })}
                aria-describedby="is_member-hint"
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{t("form.loyaltyMember")}</span>
                <span id="is_member-hint" className="block text-xs text-muted-foreground">
                  {t("form.loyaltyMemberHint")}
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
                <span className="block text-sm font-medium">{t("form.smsReminders")}</span>
                <span id="sms_consent-hint" className="block text-xs text-muted-foreground">
                  {t("form.smsRemindersHint")}
                </span>
              </span>
            </label>
            {canManageCredit ? (
            <>
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="credit_limit">{t("form.creditLimit")}</Label>
              <Input
                id="credit_limit"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={formData.credit_limit}
                onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                placeholder={t("form.noLimit")}
                aria-describedby="credit_limit-hint"
                aria-invalid={!!(getFieldError("creditLimit") || getFieldError("credit_limit"))}
              />
              <p id="credit_limit-hint" className="text-xs text-muted-foreground">
                {t("form.creditLimitHint")}
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
                hint={t("form.creditDaysHint")}
              />
            </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("form.creditLimitReadOnly")}{" "}
                {customer.credit_limit != null ? (
                  <CurrencyDisplay amount={customer.credit_limit} className="font-medium text-foreground" />
                ) : (
                  <span className="font-medium text-foreground">{t("form.noLimitLower")}</span>
                )}
                {t("form.paymentTermsReadOnly", { terms: creditTermsLabel(customer.credit_days) })}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.medical")}{" "}
              <span className="font-normal normal-case text-muted-foreground/70">
                {t("form.medicalHint")}
              </span>
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">{t("form.allergies")}</Label>
              <Input
                id="allergies"
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder={t("form.allergiesPlaceholder")}
                aria-describedby="edit-allergies-help"
              />
              <p id="edit-allergies-help" className="text-xs text-muted-foreground">
                {t("form.allergiesHelp")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="chronic_conditions">{t("form.chronicConditions")}</Label>
                <Input
                  id="chronic_conditions"
                  value={formData.chronic_conditions}
                  onChange={(e) => setFormData({ ...formData, chronic_conditions: e.target.value })}
                  placeholder={t("form.chronicPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current_medications">{t("form.currentMedications")}</Label>
                <Input
                  id="current_medications"
                  value={formData.current_medications}
                  onChange={(e) => setFormData({ ...formData, current_medications: e.target.value })}
                  placeholder={t("form.medicationsPlaceholder")}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.insurance")} <span className="font-normal normal-case text-muted-foreground/70">{t("form.optional")}</span>
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="insurance_provider">{t("form.insuranceProvider")}</Label>
                <Input
                  id="insurance_provider"
                  value={formData.insurance_provider}
                  onChange={(e) => setFormData({ ...formData, insurance_provider: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="insurance_number">{t("form.insuranceNumber")}</Label>
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
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" loading={isLoading} loadingText={t("form.saving")}>
              {tc("actions.saveChanges")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
