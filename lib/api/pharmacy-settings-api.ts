/**
 * The tenant's pharmacy settings on the .NET API (Reference module): GET/PUT /reference/settings.
 * VatRatePercent here is the one rate the server uses to compute VAT on a sale and print it on the
 * invoice, so checkout reads it from here too.
 *
 * GET needs Reference.Settings.View (a basic permission every tenant user has); PUT needs
 * Reference.Settings.Update. The PUT takes the whole settings object, so a VAT-only change
 * re-sends the other fields as they are.
 */

import { z } from "zod"
import { dotnetClient } from "@/lib/api/dotnet-client"

const SETTINGS_PATH = "/api/v1/reference/settings"

export const pharmacySettingsSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  businessAddress: z.string().nullish().transform((v) => v ?? null),
  businessPhone: z.string().nullish().transform((v) => v ?? null),
  businessEmail: z.string().nullish().transform((v) => v ?? null),
  currencyCode: z.string(),
  vatRatePercent: z.number(),
  invoiceNumberPrefix: z.string(),
  nextInvoiceSequence: z.number(),
  updatedAtUtc: z.string().nullish().transform((v) => v ?? null),
})

export type PharmacySettings = z.infer<typeof pharmacySettingsSchema>

/** Body of PUT /reference/settings (UpdatePharmacySettingsCommand). */
export interface UpdatePharmacySettingsBody {
  businessName: string
  businessAddress: string | null
  businessPhone: string | null
  businessEmail: string | null
  currencyCode: string
  vatRatePercent: number
  invoiceNumberPrefix: string
}

/** The server accepts 0-100 with at most 2 decimals (numeric(5,2)). Returns an error message or null. */
export function validateVatRatePercent(value: number): string | null {
  if (!Number.isFinite(value)) return "Enter a VAT rate between 0 and 100."
  if (value < 0 || value > 100) return "The VAT rate must be between 0 and 100."
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return "Use at most 2 decimal places for the VAT rate."
  return null
}

/** Keeps every other field as saved and only replaces the VAT rate. */
export function buildVatRateUpdateBody(current: PharmacySettings, vatRatePercent: number): UpdatePharmacySettingsBody {
  return {
    businessName: current.businessName,
    businessAddress: current.businessAddress,
    businessPhone: current.businessPhone,
    businessEmail: current.businessEmail,
    currencyCode: current.currencyCode,
    vatRatePercent: Math.round(vatRatePercent * 100) / 100,
    invoiceNumberPrefix: current.invoiceNumberPrefix,
  }
}

export const pharmacySettingsApi = {
  async get(): Promise<PharmacySettings> {
    return pharmacySettingsSchema.parse(await dotnetClient.get<unknown>(SETTINGS_PATH))
  },

  /** Reads the current settings, then saves them back with the new VAT rate. */
  async updateVatRate(vatRatePercent: number): Promise<PharmacySettings> {
    const error = validateVatRatePercent(vatRatePercent)
    if (error) throw new Error(error)
    const current = await this.get()
    await dotnetClient.put<string>(SETTINGS_PATH, buildVatRateUpdateBody(current, vatRatePercent))
    return { ...current, vatRatePercent: Math.round(vatRatePercent * 100) / 100 }
  },
}
