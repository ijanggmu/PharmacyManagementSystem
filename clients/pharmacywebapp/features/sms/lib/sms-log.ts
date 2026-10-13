import type { SmsStatus } from "@/features/sms/api-client"

const KIND_LABELS: Record<string, string> = {
  DuesReminder: "Dues reminder",
  RefillReminder: "Refill reminder",
  Receipt: "Receipt",
  Test: "Test",
}

export function smsKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

/** Badge tone for a status (always shown with the word, never color alone). */
export function smsStatusTone(status: SmsStatus): "success" | "danger" | "info" | "muted" {
  switch (status) {
    case "Sent":
      return "success"
    case "Failed":
      return "danger"
    case "Sending":
      return "info"
    default:
      return "muted"
  }
}
