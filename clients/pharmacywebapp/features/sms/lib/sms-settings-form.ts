import type { SmsSettingsInput } from "@/features/sms/api-client"

export type SmsFieldErrors = Partial<Record<"apiToken" | "senderId" | "duesReminderDays" | "refillReminderDays" | "maxPerHour", string>>

/** Field checks before saving (the API repeats them). */
export function validateSmsSettingsInput(input: SmsSettingsInput, hasStoredToken: boolean): SmsFieldErrors {
  const errors: SmsFieldErrors = {}
  if (input.enabled && input.provider !== "LogOnly" && !hasStoredToken && !input.apiToken.trim()) {
    errors.apiToken = "Enter the API token from your SMS provider."
  }
  if (input.enabled && input.provider === "Sparrow" && !input.senderId.trim()) errors.senderId = "Sparrow needs the sender ID it issued."
  if (!Number.isInteger(input.duesReminderDays) || input.duesReminderDays < 1 || input.duesReminderDays > 365) {
    errors.duesReminderDays = "1 to 365 days."
  }
  if (!Number.isInteger(input.refillReminderDays) || input.refillReminderDays < 0 || input.refillReminderDays > 60) {
    errors.refillReminderDays = "0 to 60 days."
  }
  if (!Number.isInteger(input.maxPerHour) || input.maxPerHour < 1 || input.maxPerHour > 10000) errors.maxPerHour = "1 to 10,000."
  return errors
}
