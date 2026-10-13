"use client"

import { Keyboard } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ESCAPE_HINT, POS_SHORTCUTS } from "@/features/sales/lib/pos-shortcuts"

function Key({ children }: { children: string }) {
  return (
    <kbd className="num inline-flex min-w-9 items-center justify-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground shadow-xs">
      {children}
    </kbd>
  )
}

/** "?" on the POS: the keyboard shortcuts, as a list a screen reader reads in order. */
export function ShortcutHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const rows = [...POS_SHORTCUTS.map((s) => ({ label: s.label, description: s.description })), ESCAPE_HINT]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" aria-hidden />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            F-keys work anywhere on this screen. +, −, Del and ? work when you are not typing in a field. The line you
            last added or clicked is the selected line.
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y rounded-lg border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-3 py-2">
              <dt className="text-sm text-muted-foreground">{row.description}</dt>
              <dd>
                <Key>{row.label}</Key>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
