"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/ui/field-error"
import { supplierNameSchema } from "@/lib/utils/validation"
import { CreditDaysField } from "@/components/shared/credit-days-field"
import { parseCreditDays } from "@/lib/utils/payment-terms"

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

/** Client-side checks run on submit; the API still validates and its field errors are merged in. */
export function validateSupplierForm(values: SupplierFormValues): SupplierFormErrors {
  const errors: SupplierFormErrors = {}
  const name = supplierNameSchema.safeParse(values.name)
  if (!name.success) errors.name = name.error.issues[0]?.message || "Enter the supplier's name."
  if (values.tax_id.trim() && !PAN.test(values.tax_id.trim())) errors.tax_id = "PAN / VAT number must be 9 digits."
  if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = "Enter a valid email, e.g. sales@supplier.com."
  if (values.phone.trim() && !PHONE.test(values.phone.trim())) errors.phone = "Enter a valid phone number."
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
  const id = (field: string) => `${idPrefix}-${field}`
  const describedBy = (field: keyof SupplierFormValues, hint?: boolean) =>
    [errors[field] ? id(`${field}-error`) : null, hint ? id(`${field}-hint`) : null].filter(Boolean).join(" ") || undefined

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Business</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={id("name")}>
              Supplier name <Required />
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
            <Label htmlFor={id("tax_id")}>PAN / VAT no.</Label>
            <Input
              id={id("tax_id")}
              value={values.tax_id}
              onChange={(e) => onChange({ tax_id: e.target.value.replace(/\s/g, "") })}
              inputMode="numeric"
              maxLength={9}
              placeholder="9 digits"
              aria-invalid={!!errors.tax_id}
              aria-describedby={describedBy("tax_id", true)}
              className="num h-10"
            />
            <p id={id("tax_id-hint")} className="text-xs text-muted-foreground">
              Printed on the supplier&apos;s VAT bills. Used in the purchase register.
            </p>
            <div id={id("tax_id-error")}>
              <FieldError message={errors.tax_id} />
            </div>
          </div>
        </div>
        {showActive && (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor={id("is_active")}>Active supplier</Label>
              <p className="text-xs text-muted-foreground">Inactive suppliers are hidden from pickers but keep their history.</p>
            </div>
            <Switch id={id("is_active")} checked={values.is_active} onCheckedChange={(checked) => onChange({ is_active: checked })} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Payment terms</legend>
        <CreditDaysField
          id={id("credit_days")}
          value={values.credit_days}
          onChange={(credit_days) => onChange({ credit_days })}
          error={errors.credit_days}
          hint="Each bill from this supplier falls due this many days after the bill date (it can be changed on the bill). Blank = no terms."
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Contact</legend>
        <p className="-mt-2 text-xs text-muted-foreground">A contact person, phone and email together make the profile complete.</p>
        <div className="space-y-1.5">
          <Label htmlFor={id("contact_person")}>Contact person</Label>
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
            <Label htmlFor={id("phone")}>Phone</Label>
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
            <Label htmlFor={id("email")}>Email</Label>
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
        <legend className="mb-2 text-sm font-semibold">Address</legend>
        <Label htmlFor={id("address")} className="sr-only">
          Address
        </Label>
        <Textarea
          id={id("address")}
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          rows={2}
          placeholder="Street, city"
          autoComplete="street-address"
        />
      </fieldset>
    </div>
  )
}
