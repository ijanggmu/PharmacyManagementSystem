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
import { useTranslations } from "@/lib/i18n/i18n-provider"

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
  const t = useTranslations("customers")
  const tc = useTranslations("common")
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
        setFormError(error ?? t("toasts.createFailed"))
        setFieldErrors(apiFieldErrors || {})
        return
      }

      toast({
        title: t("toasts.added"),
        description: t("toasts.addedDescription", { name: `${formData.first_name} ${formData.last_name}` }),
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
        title: t("toasts.error"),
        description: error?.message || t("toasts.createFailedDetail"),
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
          <DialogTitle>{t("form.addTitle")}</DialogTitle>
          <DialogDescription>{t("form.addDescription")}</DialogDescription>
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
            <div>
              <Label htmlFor="date_of_birth">{t("form.dateOfBirth")}</Label>
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
              <Label htmlFor="emergency_contact">{t("form.emergencyContact")}</Label>
              <Input
                id="emergency_contact"
                autoComplete="tel"
                value={formData.emergency_contact}
                onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
              />
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
              <p className="text-xs text-muted-foreground">
                {t("form.noCreditPermission", { terms: creditTermsLabel(null).toLowerCase() })}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3 border-t border-border/60 pt-5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.medical")} <span className="font-normal normal-case text-muted-foreground/70">{t("form.medicalHint")}</span>
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">{t("form.allergies")}</Label>
              <Input
                id="allergies"
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder={t("form.allergiesPlaceholder")}
                aria-describedby="allergies-help"
              />
              <p id="allergies-help" className="text-xs text-muted-foreground">
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
            <Button type="submit" loading={isLoading} loadingText={t("form.adding")}>
              {t("form.addTitle")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
