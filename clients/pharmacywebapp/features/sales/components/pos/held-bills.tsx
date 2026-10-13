"use client"

import { useEffect, useState } from "react"
import { Clock, Loader2, PauseCircle, PlayCircle, Smartphone, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CurrencyDisplay } from "@/components/currency-display"
import type { ParkedBillSummary } from "@/features/sales/lib/parked-bills"

interface HoldBillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultLabel: string
  lineCount: number
  total: number
  offline: boolean
  busy: boolean
  onHold: (label: string) => void
}

/** F6: names the bill (prefilled with the customer, or the time) and holds it. Enter confirms. */
export function HoldBillDialog({ open, onOpenChange, defaultLabel, lineCount, total, offline, busy, onHold }: HoldBillDialogProps) {
  const [label, setLabel] = useState(defaultLabel)
  useEffect(() => {
    if (open) setLabel(defaultLabel)
  }, [open, defaultLabel])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-primary" aria-hidden />
            Hold this bill
          </DialogTitle>
          <DialogDescription>
            {offline
              ? "You're offline: the bill is kept on this device only until you recall it here."
              : "Any till at this branch can recall it. Nothing is taken from stock until the bill is paid."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onHold(label)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="hold-label">Name for this bill</Label>
            <Input
              id="hold-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              autoFocus
              autoComplete="off"
            />
          </div>
          <p className="num text-sm text-muted-foreground">
            {lineCount} {lineCount === 1 ? "line" : "lines"} · <CurrencyDisplay amount={total} />
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} loadingText="Holding…">
              Hold bill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface HeldBillsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bills: ParkedBillSummary[]
  loading: boolean
  error: string | null
  /** Id of the bill being recalled/discarded, to show progress on its row. */
  busyId: string | null
  cartHasItems: boolean
  onRecall: (bill: ParkedBillSummary) => void
  onDiscard: (bill: ParkedBillSummary) => void
}

function heldAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min ago`
}

/** F7: the branch's held bills (and any held offline on this device), newest first. */
export function HeldBillsDialog({
  open,
  onOpenChange,
  bills,
  loading,
  error,
  busyId,
  cartHasItems,
  onRecall,
  onDiscard,
}: HeldBillsDialogProps) {
  const now = Date.now()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" aria-hidden />
            Held bills
          </DialogTitle>
          <DialogDescription>
            Recalling a bill puts it back in the cart, priced at today&apos;s batch prices. Held bills expire automatically.
          </DialogDescription>
        </DialogHeader>
        {cartHasItems ? (
          <p role="note" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            The cart has items. Hold or clear it before recalling another bill.
          </p>
        ) : null}
        {loading ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading held bills…
          </div>
        ) : error ? (
          <p role="alert" className="py-4 text-sm text-destructive">
            {error}
          </p>
        ) : bills.length === 0 ? (
          <EmptyState size="compact" icon={PauseCircle} title="No held bills" description="Press F6 to hold the current bill." />
        ) : (
          <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border" aria-label="Held bills">
            {bills.map((bill) => (
              <li key={bill.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{bill.label}</span>
                    {bill.source === "local" ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px]" title="Held offline on this device">
                        <Smartphone className="h-3 w-3" aria-hidden />
                        This device
                      </Badge>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {bill.customerName ? (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden />
                        {bill.customerName}
                      </span>
                    ) : null}
                    <span className="num">
                      {bill.lineCount} {bill.lineCount === 1 ? "line" : "lines"} · <CurrencyDisplay amount={bill.totalAmount} />
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden />
                      {heldAgo(bill.parkedAtUtc, now)}
                      {bill.parkedByName ? ` by ${bill.parkedByName}` : ""}
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onRecall(bill)}
                  disabled={cartHasItems || busyId !== null}
                  loading={busyId === bill.id}
                  aria-label={`Recall ${bill.label}`}
                >
                  Recall
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onDiscard(bill)}
                  disabled={busyId !== null}
                  aria-label={`Discard ${bill.label}`}
                  title="Discard"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
