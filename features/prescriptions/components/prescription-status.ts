import type { LucideIcon } from "lucide-react"
import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react"
import type { Prescription } from "@/features/prescriptions/api-client"

/** One place for prescription status words, badge tones and icons — never color alone. */
export const PRESCRIPTION_STATUS: Record<
  Prescription["status"],
  { label: string; variant: "warning" | "success" | "info" | "muted"; icon: LucideIcon }
> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  partially_filled: { label: "Partially filled", variant: "info", icon: CircleDashed },
  filled: { label: "Filled", variant: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "muted", icon: XCircle },
}

export function getPrescriptionStatus(status: string) {
  return (
    PRESCRIPTION_STATUS[status as Prescription["status"]] ?? {
      label: status,
      variant: "muted" as const,
      icon: Clock,
    }
  )
}
