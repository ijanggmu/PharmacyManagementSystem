"use client"

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import LoginForm from "@/components/login-form"
import { GetStartedForm } from "@/components/get-started-form"
import ForgotPasswordForm from "@/components/forgot-password-form"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AuthDialog() {
  const { open, mode, pharmacyCode, close } = useAuthDialog()

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "w-[calc(100%-1.5rem)] gap-0 border-0 bg-transparent p-0 shadow-none",
          "sm:max-w-2xl md:max-w-3xl",
          "max-h-[min(90dvh,880px)] overflow-visible"
        )}
      >
        <DialogTitle className="sr-only">
          {mode === "signin"
            ? "Sign in to PharmaCare"
            : mode === "forgot"
              ? "Reset your password"
              : "Create your pharmacy workspace"}
        </DialogTitle>

        <div
          className={cn(
            "relative flex max-h-[min(90dvh,880px)] flex-col overflow-hidden rounded-2xl",
            "border border-slate-200/90 bg-background",
            "shadow-[0_25px_50px_-12px_rgba(15,23,42,0.18)]",
            "dark:border-border dark:bg-card dark:shadow-2xl"
          )}
        >
          <div
            className="h-1 w-full shrink-0 bg-gradient-to-r from-teal-500 via-teal-600 to-emerald-500"
            aria-hidden
          />

          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3 z-10 h-9 w-9 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-9">
            {mode === "signin" ? (
              <LoginForm initialPharmacyCode={pharmacyCode} lockPharmacyCode={Boolean(pharmacyCode)} />
            ) : mode === "forgot" ? (
              <ForgotPasswordForm />
            ) : (
              <GetStartedForm />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

