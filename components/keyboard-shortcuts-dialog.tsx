"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Keyboard } from "lucide-react"

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? "⌘" : "Ctrl"

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: `${mod} + K`, description: "Open Point of Sale (New Sale)" },
]

export interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="keyboard-shortcuts-description">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </div>
          <DialogDescription id="keyboard-shortcuts-description">
            Use these shortcuts anywhere in the dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, description }) => (
            <div
              key={keys}
              className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">{description}</span>
              <kbd className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded border bg-background px-2 font-mono text-xs font-medium">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
