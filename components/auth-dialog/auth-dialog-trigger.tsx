"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { useAuthDialog, type AuthDialogMode } from "@/lib/contexts/auth-dialog-context"

type AuthDialogButtonProps = {
  mode: AuthDialogMode
  children: React.ReactNode
  onClick?: React.ComponentProps<typeof Button>["onClick"]
} & Omit<React.ComponentProps<typeof Button>, "children" | "onClick">

export function AuthDialogButton({ mode, children, ...buttonProps }: AuthDialogButtonProps) {
  const { openGetStarted, openSignIn } = useAuthDialog()

  return (
    <Button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      onClick={(e) => {
        buttonProps.onClick?.(e as any)
        if (mode === "signin") openSignIn()
        else openGetStarted()
      }}
    >
      {children}
    </Button>
  )
}

type AuthDialogLinkProps = {
  mode: AuthDialogMode
  children: React.ReactNode
  className?: string
}

export function AuthDialogLink({ mode, children, className }: AuthDialogLinkProps) {
  const { openGetStarted, openSignIn } = useAuthDialog()

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (mode === "signin") openSignIn()
        else openGetStarted()
      }}
    >
      {children}
    </button>
  )
}

