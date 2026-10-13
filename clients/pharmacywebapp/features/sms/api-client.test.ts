import { describe, expect, it } from "vitest"
import {
  buildSmsSettingsBody,
  smsMessageSchema,
  smsMessagesQuery,
  smsSettingsSchema,
  toSmsSettingsInput,
} from "./api-client"
import { validateSmsSettingsInput } from "./lib/sms-settings-form"

const dto = {
  enabled: true,
  provider: "Sparrow",
  senderId: "PHARMA",
  hasApiToken: true,
  pharmacyName: "City Pharmacy",
  defaultLanguage: "ne",
  receiptsEnabled: true,
  autoDuesReminders: false,
  duesReminderDays: 7,
  autoRefillReminders: true,
  refillReminderDays: 3,
  quietHoursStart: 21,
  quietHoursEnd: 7,
  maxPerHour: 100,
  templates: [{ kind: "RefillReminder", language: "en", body: "Refill due. Reply STOP to opt out." }],
  updatedAtUtc: "2026-10-13T06:00:00Z",
}

describe("sms settings mapping", () => {
  it("parses the DTO and never carries a token into the form", () => {
    const settings = smsSettingsSchema.parse(dto)
    const input = toSmsSettingsInput(settings)
    expect(input.apiToken).toBe("")
    expect(input.provider).toBe("Sparrow")
    expect(input.defaultLanguage).toBe("ne")
  })

  it("falls back on unknown enum values", () => {
    const settings = smsSettingsSchema.parse({ ...dto, provider: "Twilio", defaultLanguage: "fr" })
    expect(settings.provider).toBe("LogOnly")
    expect(settings.defaultLanguage).toBe("en")
  })

  it("sends a blank token as null (keep the stored one) and trims text", () => {
    const input = { ...toSmsSettingsInput(smsSettingsSchema.parse(dto)), senderId: "  PHARMA ", pharmacyName: " " }
    const body = buildSmsSettingsBody(input)
    expect(body.apiToken).toBeNull()
    expect(body.senderId).toBe("PHARMA")
    expect(body.pharmacyName).toBeNull()
    expect(buildSmsSettingsBody({ ...input, apiToken: " tok " }).apiToken).toBe("tok")
  })
})

describe("validateSmsSettingsInput", () => {
  const base = toSmsSettingsInput(smsSettingsSchema.parse({ ...dto, hasApiToken: false }))

  it("needs a token and (for Sparrow) a sender ID before turning SMS on", () => {
    const errors = validateSmsSettingsInput({ ...base, senderId: "" }, false)
    expect(errors.apiToken).toBeDefined()
    expect(errors.senderId).toBeDefined()
    expect(validateSmsSettingsInput({ ...base, apiToken: "x" }, false)).toEqual({})
    expect(validateSmsSettingsInput(base, true)).toEqual({})
  })

  it("needs nothing for the log-only provider", () => {
    expect(validateSmsSettingsInput({ ...base, provider: "LogOnly", senderId: "" }, false)).toEqual({})
  })

  it("checks the ranges", () => {
    const errors = validateSmsSettingsInput({ ...base, duesReminderDays: 0, refillReminderDays: 61, maxPerHour: 0 }, true)
    expect(Object.keys(errors).sort()).toEqual(["duesReminderDays", "maxPerHour", "refillReminderDays"])
  })
})

describe("sms log", () => {
  it("builds the list query", () => {
    expect(smsMessagesQuery({ page: 2, pageSize: 500, status: "Failed", kind: "Receipt" })).toBe(
      "/notifications/sms/messages?pageNumber=2&pageSize=100&status=Failed&kind=Receipt",
    )
  })

  it("parses a message with nullable fields", () => {
    const message = smsMessageSchema.parse({
      id: "1",
      kind: "Receipt",
      status: "Sent",
      trigger: "Manual",
      phoneMasked: "98******67",
      body: "Thanks",
      language: "en",
      segments: 1,
      encoding: "GSM",
      provider: "Aakash",
      attempts: 1,
      credits: 1,
      createdAtUtc: "2026-10-13T06:00:00Z",
    })
    expect(message.lastError).toBeNull()
    expect(message.credits).toBe(1)
  })
})
