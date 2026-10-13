/**
 * SMS on the .NET API (Notifications module, /notifications/sms/…): settings + templates, test message, the SMS log,
 * retrying a failed message, and the manual dues reminder. Every response is Zod-validated. The gateway token is
 * write-only — GET never returns it, and a blank token on save keeps the stored one.
 */

import { z } from "zod"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { SMS_LANGUAGES, SMS_TEMPLATE_KINDS, type SmsLanguage, type SmsTemplateKind } from "@/features/sms/lib/sms-template"

export const SMS_PROVIDERS = ["LogOnly", "Sparrow", "Aakash"] as const
export type SmsProvider = (typeof SMS_PROVIDERS)[number]

export const SMS_PROVIDER_LABELS: Record<SmsProvider, string> = {
  LogOnly: "Log only (testing — nothing is sent)",
  Sparrow: "Sparrow SMS",
  Aakash: "Aakash SMS",
}

const oneOf = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z
    .string()
    .nullish()
    .transform((v) => ((values as readonly string[]).includes(v ?? "") ? (v as T[number]) : fallback))

const nullableText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v))

export const smsTemplateSchema = z.object({
  kind: oneOf(SMS_TEMPLATE_KINDS as unknown as readonly [SmsTemplateKind, ...SmsTemplateKind[]], "DuesReminder"),
  language: oneOf(SMS_LANGUAGES as unknown as readonly [SmsLanguage, ...SmsLanguage[]], "en"),
  body: z.string(),
})

export type SmsTemplate = z.infer<typeof smsTemplateSchema>

export const smsSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: oneOf(SMS_PROVIDERS, "LogOnly"),
  senderId: nullableText,
  hasApiToken: z.boolean(),
  pharmacyName: nullableText,
  defaultLanguage: oneOf(["en", "ne"] as const, "en"),
  receiptsEnabled: z.boolean(),
  autoDuesReminders: z.boolean(),
  duesReminderDays: z.number().int(),
  autoRefillReminders: z.boolean(),
  refillReminderDays: z.number().int(),
  quietHoursStart: z.number().int(),
  quietHoursEnd: z.number().int(),
  maxPerHour: z.number().int(),
  templates: z.array(smsTemplateSchema),
  updatedAtUtc: z.string().nullish().transform((v) => v ?? null),
})

export type SmsSettings = z.infer<typeof smsSettingsSchema>

export const smsStatusSchema = z.object({ enabled: z.boolean(), receiptsEnabled: z.boolean() })
export type SmsStatusInfo = z.infer<typeof smsStatusSchema>

export const SMS_STATUSES = ["Queued", "Sending", "Sent", "Failed"] as const
export type SmsStatus = (typeof SMS_STATUSES)[number]

export const smsMessageSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: oneOf(SMS_STATUSES, "Queued"),
  trigger: z.string(),
  customerId: z.string().nullish().transform((v) => v ?? null),
  recipientName: nullableText,
  phoneMasked: z.string(),
  body: z.string(),
  language: z.string(),
  segments: z.number(),
  encoding: z.string(),
  provider: z.string(),
  attempts: z.number(),
  lastError: nullableText,
  responseCode: nullableText,
  responseMessage: nullableText,
  providerMessageId: nullableText,
  credits: z.number().nullish().transform((v) => v ?? null),
  requestedBy: nullableText,
  createdAtUtc: z.string(),
  sentAtUtc: z.string().nullish().transform((v) => v ?? null),
  nextAttemptAtUtc: z.string().nullish().transform((v) => v ?? null),
})

export type SmsMessage = z.infer<typeof smsMessageSchema>

export const smsMessagePageSchema = z.object({
  items: z.array(smsMessageSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
})

export type SmsMessagePage = z.infer<typeof smsMessagePageSchema>

/** The editable form. The token is write-only: blank means "keep the stored one". */
export interface SmsSettingsInput {
  enabled: boolean
  provider: SmsProvider
  senderId: string
  apiToken: string
  pharmacyName: string
  defaultLanguage: SmsLanguage
  receiptsEnabled: boolean
  autoDuesReminders: boolean
  duesReminderDays: number
  autoRefillReminders: boolean
  refillReminderDays: number
  quietHoursStart: number
  quietHoursEnd: number
  maxPerHour: number
  templates: SmsTemplate[]
}

export function toSmsSettingsInput(settings: SmsSettings): SmsSettingsInput {
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    senderId: settings.senderId ?? "",
    apiToken: "",
    pharmacyName: settings.pharmacyName ?? "",
    defaultLanguage: settings.defaultLanguage,
    receiptsEnabled: settings.receiptsEnabled,
    autoDuesReminders: settings.autoDuesReminders,
    duesReminderDays: settings.duesReminderDays,
    autoRefillReminders: settings.autoRefillReminders,
    refillReminderDays: settings.refillReminderDays,
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
    maxPerHour: settings.maxPerHour,
    templates: settings.templates.map((t) => ({ ...t })),
  }
}

const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim())

/** PUT body: trimmed text, blanks as null (a null token keeps the stored one). */
export function buildSmsSettingsBody(input: SmsSettingsInput) {
  return {
    enabled: input.enabled,
    provider: input.provider,
    senderId: blankToNull(input.senderId),
    apiToken: blankToNull(input.apiToken),
    pharmacyName: blankToNull(input.pharmacyName),
    defaultLanguage: input.defaultLanguage,
    receiptsEnabled: input.receiptsEnabled,
    autoDuesReminders: input.autoDuesReminders,
    duesReminderDays: Math.trunc(input.duesReminderDays),
    autoRefillReminders: input.autoRefillReminders,
    refillReminderDays: Math.trunc(input.refillReminderDays),
    quietHoursStart: Math.trunc(input.quietHoursStart),
    quietHoursEnd: Math.trunc(input.quietHoursEnd),
    maxPerHour: Math.trunc(input.maxPerHour),
    templates: input.templates.map((t) => ({ kind: t.kind, language: t.language, body: t.body.trim() })),
  }
}

export interface SmsMessageFilters {
  page?: number
  pageSize?: number
  status?: SmsStatus | null
  kind?: string | null
  customerId?: string | null
}

export function smsMessagesQuery(filters: SmsMessageFilters = {}): string {
  const p = new URLSearchParams()
  p.set("pageNumber", String(Math.max(1, Math.trunc(filters.page ?? 1))))
  p.set("pageSize", String(Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 20)))))
  if (filters.status) p.set("status", filters.status)
  if (filters.kind) p.set("kind", filters.kind)
  if (filters.customerId) p.set("customerId", filters.customerId)
  return `/notifications/sms/messages?${p.toString()}`
}

export const smsApi = {
  /** Whether SMS / SMS receipts are on (any signed-in user; the checkout uses it). */
  async getStatus(): Promise<SmsStatusInfo> {
    return smsStatusSchema.parse(await dotnetClient.get<unknown>("/notifications/sms/status"))
  },
  async getSettings(): Promise<SmsSettings> {
    return smsSettingsSchema.parse(await dotnetClient.get<unknown>("/notifications/sms/settings"))
  },
  async updateSettings(input: SmsSettingsInput): Promise<SmsSettings> {
    return smsSettingsSchema.parse(await dotnetClient.put<unknown>("/notifications/sms/settings", buildSmsSettingsBody(input)))
  },
  async sendTest(phone: string): Promise<SmsMessage> {
    return smsMessageSchema.parse(await dotnetClient.post<unknown>("/notifications/sms/test", { phone: phone.trim() }))
  },
  async listMessages(filters?: SmsMessageFilters): Promise<SmsMessagePage> {
    return smsMessagePageSchema.parse(await dotnetClient.get<unknown>(smsMessagesQuery(filters)))
  },
  async retry(id: string): Promise<SmsMessage> {
    return smsMessageSchema.parse(await dotnetClient.post<unknown>(`/notifications/sms/messages/${encodeURIComponent(id)}/retry`, {}))
  },
  async sendDuesReminder(customerId: string): Promise<SmsMessage> {
    return smsMessageSchema.parse(await dotnetClient.post<unknown>("/notifications/sms/dues-reminders", { customerId }))
  },
}
