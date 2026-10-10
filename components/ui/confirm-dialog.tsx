"use client"

import type React from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "default" | "destructive"
  /** Shows a spinner on the confirm button and blocks dismissal while the action runs. */
  loading?: boolean
  confirmDisabled?: boolean
}

/**
 * Confirmation for consequential actions. Built on the Radix dialog, so it traps
 * focus, closes on Escape, restores focus to the trigger and is announced as a
 * dialog. Focus starts on Cancel so a stray Enter never confirms a destructive action.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  loading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const destructive = variant === "destructive"

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!loading}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const cancel = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLButtonElement>("[data-confirm-cancel]")
          cancel?.focus()
        }}
      >
        <DialogHeader className="flex-row items-start gap-3 text-left">
          {destructive && (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              aria-hidden
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 space-y-1.5">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className={cn("gap-2 sm:gap-2")}>
          <Button variant="outline" onClick={onClose} disabled={loading} data-confirm-cancel>
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            variant={destructive ? "destructive" : "default"}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
