"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Truck, XCircle, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { nepalTodayYmd } from "@/lib/utils/date-limits"
import type { StockTransfer } from "@/features/inventory/api-client-stock-transfers"

export const TRANSFER_STATUS_META: Record<
  StockTransfer["status"],
  { label: string; tone: "info" | "success" | "danger"; icon: LucideIcon }
> = {
  in_transit: { label: "In transit", tone: "info", icon: Truck },
  completed: { label: "Received", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "danger", icon: XCircle },
}

export function TransferStatusBadge({ status }: { status: StockTransfer["status"] }) {
  const meta = TRANSFER_STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.tone}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  )
}

/** AD date-time with the Nepali (BS) date underneath, as on the other list screens. */
export function DualDate({ utc, withTime = true }: { utc: string | null | undefined; withTime?: boolean }) {
  if (!utc) return <span className="text-muted-foreground">—</span>
  const date = new Date(utc)
  const ad = withTime
    ? date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  const bs = formatBsYmd(nepalTodayYmd(date))
  return (
    <span className="flex flex-col">
      <span className="num whitespace-nowrap text-sm">{ad}</span>
      {bs && <span className="num text-xs text-muted-foreground">BS {bs}</span>}
    </span>
  )
}

export function TransferRoute({ transfer }: { transfer: StockTransfer }) {
  const from = transfer.from_branch?.name || "—"
  const to = transfer.to_branch?.name || "—"
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-sm" aria-label={`From ${from} to ${to}`}>
      <span className="font-medium">{from}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="font-medium">{to}</span>
    </span>
  )
}

/** Confirms a cancellation (restores stock to the source branch) and collects an optional reason. */
export function CancelTransferDialog({
  transfer,
  pending,
  onConfirm,
  onOpenChange,
}: {
  transfer: StockTransfer | null
  pending: boolean
  onConfirm: (reason: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState("")
  return (
    <Dialog
      open={!!transfer}
      onOpenChange={(open) => {
        if (!open) setReason("")
        onOpenChange(open)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel transfer {transfer?.transfer_number}?</DialogTitle>
          <DialogDescription>
            Stock goes back to {transfer?.from_branch?.name || "the source branch"}. Only possible while the transfer is
            still in transit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="transfer-cancel-reason">Reason</Label>
          <Textarea
            id="transfer-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. dispatched to the wrong branch"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">Optional. Kept with the transfer for audit.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep transfer
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim() || "Cancelled before receipt")}
            loading={pending}
            loadingText="Cancelling…"
          >
            Cancel transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
