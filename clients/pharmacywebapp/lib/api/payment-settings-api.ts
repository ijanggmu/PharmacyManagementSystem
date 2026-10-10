/**
 * POS payment settings (static bank QR + Fonepay dynamic QR) and Fonepay QR calls on the .NET API
 * (SALES area): /sales/payment-settings, /sales/fonepay/qr and /sales/fonepay/qr/{prn}/status.
 *
 * Every response is Zod-validated. A missing or unavailable endpoint (404/405/501/503) is reported
 * as "not configured" (null) instead of an error, so the POS keeps working against an older API.
 */

import { z } from "zod"
import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"

const nullableText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v))

const lowerEnum = <T extends [string, ...string[]]>(values: T, fallback: T[number]) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const lower = (v ?? "").toLowerCase()
      return ((values as readonly string[]).includes(lower) ? lower : fallback) as T[number]
    })

export const paymentSettingsSchema = z.object({
  bankQrEnabled: z.boolean().nullish().transform((v) => v ?? false),
  bankName: nullableText,
  accountName: nullableText,
  accountNumber: nullableText,
  bankQrImage: nullableText,
  fonepayEnabled: z.boolean().nullish().transform((v) => v ?? false),
  fonepayMerchantCode: nullableText,
  fonepayUsername: nullableText,
  fonepayEnvironment: lowerEnum(["dev", "live"], "dev"),
  fonepayHasSecret: z.boolean().nullish().transform((v) => v ?? false),
  fonepayHasPassword: z.boolean().nullish().transform((v) => v ?? false),
})

export type PaymentSettings = z.infer<typeof paymentSettingsSchema>
export type FonepayEnvironment = PaymentSettings["fonepayEnvironment"]

export const fonepayQrSchema = z.object({
  prn: z.string().min(1),
  qrMessage: z.string().min(1),
  amount: z.number(),
  webSocketUrl: z.string().nullish().transform((v) => v ?? null),
  createdAtUtc: z.string(),
})

export type FonepayQr = z.infer<typeof fonepayQrSchema>

export const fonepayQrStatusSchema = z.object({
  prn: z.string(),
  status: lowerEnum(["pending", "success", "failed"], "pending"),
  message: z.string().nullish().transform((v) => v ?? null),
  traceId: z.string().nullish().transform((v) => (v == null || v.trim() === "" ? null : v)),
})

export type FonepayQrStatus = z.infer<typeof fonepayQrStatusSchema>

/** Form-side shape of the editable settings. Secrets are write-only: blank means "keep existing". */
export interface PaymentSettingsInput {
  bankQrEnabled: boolean
  bankName: string
  accountName: string
  accountNumber: string
  bankQrImage: string | null
  fonepayEnabled: boolean
  fonepayMerchantCode: string
  fonepayUsername: string
  fonepayEnvironment: FonepayEnvironment
  fonepaySecretKey: string
  fonepayPassword: string
}

export interface DotnetPaymentSettingsBody {
  bankQrEnabled: boolean
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  bankQrImage: string | null
  fonepayEnabled: boolean
  fonepayMerchantCode: string | null
  fonepayUsername: string | null
  fonepayEnvironment: FonepayEnvironment
  fonepaySecretKey: string | null
  fonepayPassword: string | null
}

/** Largest bank QR image the API accepts, as a data URL string. */
export const MAX_QR_DATA_URL_LENGTH = 700_000
/** Largest file a cashier may pick before we downscale it. */
export const MAX_QR_FILE_BYTES = 500 * 1024
export const ALLOWED_QR_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

const blankToNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

export function parsePaymentSettings(raw: unknown): PaymentSettings {
  return paymentSettingsSchema.parse(raw)
}

export function emptyPaymentSettings(): PaymentSettings {
  return paymentSettingsSchema.parse({})
}

/** Maps a GET DTO onto the editable form (secrets always start blank). */
export function toPaymentSettingsInput(settings: PaymentSettings): PaymentSettingsInput {
  return {
    bankQrEnabled: settings.bankQrEnabled,
    bankName: settings.bankName ?? "",
    accountName: settings.accountName ?? "",
    accountNumber: settings.accountNumber ?? "",
    bankQrImage: settings.bankQrImage,
    fonepayEnabled: settings.fonepayEnabled,
    fonepayMerchantCode: settings.fonepayMerchantCode ?? "",
    fonepayUsername: settings.fonepayUsername ?? "",
    fonepayEnvironment: settings.fonepayEnvironment,
    fonepaySecretKey: "",
    fonepayPassword: "",
  }
}

/** Builds the PUT body: trims text, blanks become null (and null secret = keep the saved one). */
export function buildPaymentSettingsBody(input: PaymentSettingsInput): DotnetPaymentSettingsBody {
  return {
    bankQrEnabled: input.bankQrEnabled,
    bankName: blankToNull(input.bankName),
    accountName: blankToNull(input.accountName),
    accountNumber: blankToNull(input.accountNumber),
    bankQrImage: blankToNull(input.bankQrImage),
    fonepayEnabled: input.fonepayEnabled,
    fonepayMerchantCode: blankToNull(input.fonepayMerchantCode),
    fonepayUsername: blankToNull(input.fonepayUsername),
    fonepayEnvironment: input.fonepayEnvironment,
    fonepaySecretKey: blankToNull(input.fonepaySecretKey),
    fonepayPassword: blankToNull(input.fonepayPassword),
  }
}

export type PaymentSettingsErrors = Partial<Record<keyof PaymentSettingsInput, string>>

/**
 * Client-side checks before saving. Enabling a feature needs what the POS shows or sends; secrets
 * are only required when none is saved yet.
 */
export function validatePaymentSettingsInput(
  input: PaymentSettingsInput,
  saved: Pick<PaymentSettings, "fonepayHasSecret" | "fonepayHasPassword"> = { fonepayHasSecret: false, fonepayHasPassword: false },
): PaymentSettingsErrors {
  const errors: PaymentSettingsErrors = {}
  if (input.bankQrEnabled) {
    if (!input.bankQrImage) errors.bankQrImage = "Upload the bank's QR image to show it at the counter."
    if (!input.accountName.trim()) errors.accountName = "Enter the account name customers will see."
  }
  if (input.bankQrImage && !isAllowedQrDataUrl(input.bankQrImage)) {
    errors.bankQrImage = "The QR image must be a PNG, JPEG or WebP under 700 KB."
  }
  if (input.fonepayEnabled) {
    if (!input.fonepayMerchantCode.trim()) errors.fonepayMerchantCode = "Enter the merchant code from Fonepay."
    if (!input.fonepayUsername.trim()) errors.fonepayUsername = "Enter the API username from Fonepay."
    if (!saved.fonepayHasPassword && !input.fonepayPassword.trim()) errors.fonepayPassword = "Enter the API password."
    if (!saved.fonepayHasSecret && !input.fonepaySecretKey.trim()) errors.fonepaySecretKey = "Enter the secret key."
  }
  return errors
}

/** Validates a picked file before reading it. Returns an error message, or null when it is fine. */
export function validateQrImageFile(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_QR_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a PNG, JPEG or WebP image."
  }
  if (file.size > MAX_QR_FILE_BYTES) return "The image is larger than 500 KB. Choose a smaller file."
  return null
}

export function isAllowedQrDataUrl(dataUrl: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) && dataUrl.length <= MAX_QR_DATA_URL_LENGTH
}

/** True for statuses that mean "this API does not have the endpoint (yet)". */
export function isNotConfiguredError(error: unknown): boolean {
  if (!(error instanceof DotnetApiError)) return false
  return [404, 405, 501, 503].includes(error.normalized.status)
}

export function buildFonepayQrBody(input: { amount: number; remarks1?: string; remarks2?: string }) {
  const body: { amount: number; remarks1?: string; remarks2?: string } = {
    amount: Math.round(input.amount * 100 + 1e-7) / 100,
  }
  // Fonepay remarks are short free text; keep them within 25 chars.
  const r1 = input.remarks1?.trim()
  const r2 = input.remarks2?.trim()
  if (r1) body.remarks1 = r1.slice(0, 25)
  if (r2) body.remarks2 = r2.slice(0, 25)
  return body
}

export const paymentSettingsApi = {
  /** Returns null when the API has no payment settings endpoint (treated as "not configured"). */
  async get(): Promise<PaymentSettings | null> {
    try {
      return parsePaymentSettings(await dotnetClient.get<unknown>("/sales/payment-settings"))
    } catch (error) {
      if (isNotConfiguredError(error)) return null
      throw error
    }
  },

  async update(input: PaymentSettingsInput): Promise<PaymentSettings> {
    return parsePaymentSettings(await dotnetClient.put<unknown>("/sales/payment-settings", buildPaymentSettingsBody(input)))
  },

  async createFonepayQr(input: { amount: number; remarks1?: string; remarks2?: string }): Promise<FonepayQr> {
    return fonepayQrSchema.parse(await dotnetClient.post<unknown>("/sales/fonepay/qr", buildFonepayQrBody(input)))
  },

  async getFonepayQrStatus(prn: string): Promise<FonepayQrStatus> {
    return fonepayQrStatusSchema.parse(
      await dotnetClient.get<unknown>(`/sales/fonepay/qr/${encodeURIComponent(prn)}/status`),
    )
  },
}
