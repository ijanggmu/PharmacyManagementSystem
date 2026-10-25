"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/ui/field-error"
import { supplierNameSchema } from "@/lib/utils/validation"
import { CreditDaysField } from "@/components/shared/credit-days-field"
import { parseCreditDays } from "@/lib/utils/payment-terms"
import { useTranslations } from "@/lib/i18n/i18n-provider"

export interface SupplierFormValues {
  name: string
  tax_id: string
  contact_person: string
  phone: string
  email: string
  address: string
  is_active: boolean
  /** Default payment terms in days, as typed; blank = no terms. */
  credit_days: string
}

export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  name: "",
  tax_id: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  is_active: true,
  credit_days: "",
}

export type SupplierFormErrors = Partial<Record<keyof SupplierFormValues, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Nepal PAN / VAT numbers are 9 digits. */
const PAN = /^\d{9}$/
const PHONE = /^[+\d][\d\s-]{5,19}$/

/** Validation messages in the UI language (suppliers.validation.*); omitted = the English defaults. */
export interface SupplierValidationMessages {
  name: string
  nameLength: string
  nameInvalid: string
  pan: string
  email: string
  phone: string
}

/** Client-side checks run on submit; the API still validates and its field errors are merged in. */
export function validateSupplierForm(values: SupplierFormValues, messages?: SupplierValidationMessages): SupplierFormErrors {
  const errors: SupplierFormErrors = {}
  const name = supplierNameSchema.safeParse(values.name)
  if (!name.success) {
    const issue = name.error.issues[0]
    errors.name = messages
      ? issue?.code === "too_small" || issue?.code === "too_big"
        ? messages.nameLength
        : issue?.code === "invalid_format"
          ? messages.nameInvalid
          : messages.name
      : issue?.message || "Enter the supplier's name."
  }
  if (values.tax_id.trim() && !PAN.test(values.tax_id.trim())) errors.tax_id = messages?.pan ?? "PAN / VAT number must be 9 digits."
  if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = messages?.email ?? "Enter a valid email, e.g. sales@supplier.com."
  if (values.phone.trim() && !PHONE.test(values.phone.trim())) errors.phone = messages?.phone ?? "Enter a valid phone number."
  const creditDays = parseCreditDays(values.credit_days)
  if (!creditDays.ok) errors.credit_days = creditDays.error
  return errors
}

const API_FIELD: Record<string, keyof SupplierFormValues> = {
  name: "name",
  taxid: "tax_id",
  contactperson: "contact_person",
  phone: "phone",
  email: "email",
  address: "address",
  creditdays: "credit_days",
}

/** Maps server validation keys ("TaxId", "contact_person", "Name"…) onto the form's fields. */
export function supplierErrorsFromApi(fieldErrors: Record<string, string[]> | undefined): SupplierFormErrors {
  const out: SupplierFormErrors = {}
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    const field = API_FIELD[key.toLowerCase().replace(/[_\s]/g, "")]
    if (field && messages[0]) out[field] = messages[0]
  }
  return out
}

/** Translated validation messages for validateSupplierForm. */
export function useSupplierValidationMessages(): SupplierValidationMessages {
  const t = useTranslations("suppliers")
  return {
    name: t("validation.name"),
    nameLength: t("validation.nameLength"),
    nameInvalid: t("validation.nameInvalid"),
    pan: t("validation.pan"),
    email: t("validation.email"),
    phone: t("validation.phone"),
  }
}

/** "Fields marked * are required." with the star in the destructive colour, in the UI language. */
export function RequiredFieldsNote() {
  const t = useTranslations("suppliers")
  const [before, after] = t("form.requiredNote", { star: "\u0000" }).split("\u0000")
  return (
    <>
      {before}
      <span className="text-destructive">*</span>
      {after}
    </>
  )
}

function Required() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}

/** The supplier fields, grouped, with inline errors under each field. Shared by the add and edit dialogs. */
export function SupplierFormFields({
  values,
  errors,
  onChange,
  showActive,
  idPrefix,
}: {
  values: SupplierFormValues
  errors: SupplierFormErrors
  onChange: (patch: Partial<SupplierFormValues>) => void
  /** Edit only: a new supplier is always active. */
  showActive?: boolean
  idPrefix: string
}) {
  const t = useTranslations("suppliers")
  const id = (field: string) => `${idPrefix}-${field}`
  const describedBy = (field: keyof SupplierFormValues, hint?: boolean) =>
    [errors[field] ? id(`${field}-error`) : null, hint ? id(`${field}-hint`) : null].filter(Boolean).join(" ") || undefined

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t("form.business")}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={id("name")}>
              {t("form.name")} <Required />
            </Label>
            <Input
              id={id("name")}
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              aria-invalid={!!errors.name}
              aria-describedby={describedBy("name")}
              autoComplete="organization"
              className="h-10"
              required
            />
            <div id={id("name-error")}>
              <FieldError message={errors.name} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("tax_id")}>{t("form.pan")}</Label>
            <Input
              id={id("tax_id")}
              value={values.tax_id}
              onChange={(e) => onChange({ tax_id: e.target.value.replace(/\s/g, "") })}
              inputMode="numeric"
              maxLength={9}
              placeholder={t("form.panPlaceholder")}
              aria-invalid={!!errors.tax_id}
              aria-describedby={describedBy("tax_id", true)}
              className="num h-10"
            />
            <p id={id("tax_id-hint")} className="text-xs text-muted-foreground">
              {t("form.panHint")}
            </p>
            <div id={id("tax_id-error")}>
              <FieldError message={errors.tax_id} />
            </div>
          </div>
        </div>
        {showActive && (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor={id("is_active")}>{t("form.activeSupplier")}</Label>
              <p className="text-xs text-muted-foreground">{t("form.activeSupplierHint")}</p>
            </div>
            <Switch id={id("is_active")} checked={values.is_active} onCheckedChange={(checked) => onChange({ is_active: checked })} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">{t("form.paymentTerms")}</legend>
        <CreditDaysField
          id={id("credit_days")}
          value={values.credit_days}
          onChange={(credit_days) => onChange({ credit_days })}
          error={errors.credit_days}
          hint={t("form.creditDaysHint")}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t("form.contact")}</legend>
        <p className="-mt-2 text-xs text-muted-foreground">{t("form.contactHint")}</p>
        <div className="space-y-1.5">
          <Label htmlFor={id("contact_person")}>{t("form.contactPerson")}</Label>
          <Input
            id={id("contact_person")}
            value={values.contact_person}
            onChange={(e) => onChange({ contact_person: e.target.value })}
            autoComplete="name"
            className="h-10"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={id("phone")}>{t("form.phone")}</Label>
            <Input
              id={id("phone")}
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy("phone")}
              autoComplete="tel"
              className="num h-10"
            />
            <div id={id("phone-error")}>
              <FieldError message={errors.phone} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("email")}>{t("form.email")}</Label>
            <Input
              id={id("email")}
              type="email"
              value={values.email}
              onChange={(e) => onChange({ email: e.target.value })}
              aria-invalid={!!errors.email}
              aria-describedby={describedBy("email")}
              autoComplete="email"
              className="h-10"
            />
            <div id={id("email-error")}>
              <FieldError message={errors.email} />
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-2 text-sm font-semibold">{t("form.address")}</legend>
        <Label htmlFor={id("address")} className="sr-only">
          {t("form.address")}
        </Label>
        <Textarea
          id={id("address")}
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          rows={2}
          placeholder={t("form.addressPlaceholder")}
          autoComplete="street-address"
        />
      </fieldset>
    </div>
  )
}
