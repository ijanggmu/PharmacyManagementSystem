"use client"

import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { useCustomerPermissions } from "@/features/customers/hooks/use-customer-permissions"
import { useSendDuesReminder } from "@/features/sms/hooks/use-sms"

/**
 * "Send reminder": texts the customer what they owe (total, earliest due date, invoice numbers). The API refuses when SMS
 * is off, the customer owes nothing, has no mobile number, or was reminded in the last hour — the toast says which.
 * Hidden for users without the collections permission.
 */
export function SendDuesReminderButton({
  customerId,
  customerName,
  size = "sm",
  variant = "outline",
}: {
  customerId: string
  customerName?: string | null
  size?: "sm" | "default"
  variant?: "outline" | "ghost"
}) {
  const { toast } = useToast()
  const { canSendReminder } = useCustomerPermissions()
  const send = useSendDuesReminder()
  if (!canSendReminder) return null

  const label = customerName ? `Send an SMS dues reminder to ${customerName}` : "Send an SMS dues reminder"
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      aria-label={label}
      title={label}
      disabled={send.isPending && send.variables === customerId}
      onClick={() =>
        send.mutate(customerId, {
          onSuccess: (message) =>
            toast({
              title: "Reminder queued",
              description: `To ${message.phoneMasked}. During quiet hours it is sent when they end.`,
            }),
          onError: (error) =>
            toast({ title: "Couldn't send the reminder", description: apiRequestErrorMessage(error) || error.message, variant: "destructive" }),
        })
      }
    >
      <MessageSquare className="h-3.5 w-3.5" aria-hidden />
      {size === "sm" && variant === "ghost" ? <span className="sr-only">Send reminder</span> : "Send reminder"}
    </Button>
  )
}
