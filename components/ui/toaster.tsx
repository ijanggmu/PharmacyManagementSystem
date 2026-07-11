"use client"

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Check, X as XIcon, AlertTriangle, Info } from "lucide-react"

const VARIANT_ICON: Record<string, typeof Check> = {
  success: Check,
  destructive: XIcon,
  warning: AlertTriangle,
  default: Info,
}

const VARIANT_ICON_CLASS: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  destructive: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  default: "text-muted-foreground",
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={4000}>
      {toasts.map(({ id, title, description, action, variant, ...props }) => {
        const key = variant ?? "default"
        const Icon = VARIANT_ICON[key]
        return (
          <Toast key={id} variant={variant} {...props}>
            {/* Slim variant-colored accent bar, replaces the old full-color background */}
            <span data-accent aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-xl bg-border" />
            <div className="flex flex-1 items-start gap-2.5 pl-1.5">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", VARIANT_ICON_CLASS[key])} aria-hidden />
              <div className="grid flex-1 gap-0.5">
                {title && <ToastTitle className="text-sm font-medium leading-tight">{title}</ToastTitle>}
                {description && (
                  <ToastDescription className="text-xs leading-snug text-muted-foreground">
                    {description}
                  </ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
