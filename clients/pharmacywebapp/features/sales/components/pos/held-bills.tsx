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
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import type { NamespaceTranslator } from "@/lib/i18n/translate"

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
  const t = useTranslations("pos")
  const tc = useTranslations("common")
  const { formatNumber } = useI18n()
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
            {t("held.holdTitle")}
          </DialogTitle>
          <DialogDescription>
            {offline ? t("held.holdOffline") : t("held.holdOnline")}
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
            <Label htmlFor="hold-label">{t("held.nameLabel")}</Label>
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
            {t(lineCount === 1 ? "cart.lineOne" : "cart.lines", { n: formatNumber(lineCount) })} · <CurrencyDisplay amount={total} />
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy} loadingText={t("held.holding")}>
              {t("held.holdBill")}
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

function heldAgo(iso: string, now: number, t: NamespaceTranslator<"pos">, n: (value: number) => string): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return t("held.justNow")
  if (minutes < 60) return t("held.minAgo", { m: n(minutes) })
  const hours = Math.floor(minutes / 60)
  return t("held.hourMinAgo", { h: n(hours), m: n(minutes % 60) })
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
  const t = useTranslations("pos")
  const { formatNumber } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" aria-hidden />
            {t("held.title")}
          </DialogTitle>
          <DialogDescription>{t("held.description")}</DialogDescription>
        </DialogHeader>
        {cartHasItems ? (
          <p role="note" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            {t("held.cartHasItems")}
          </p>
        ) : null}
        {loading ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("held.loading")}
          </div>
        ) : error ? (
          <p role="alert" className="py-4 text-sm text-destructive">
            {error}
          </p>
        ) : bills.length === 0 ? (
          <EmptyState size="compact" icon={PauseCircle} title={t("held.emptyTitle")} description={t("held.emptyDescription")} />
        ) : (
          <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border" aria-label={t("held.title")}>
            {bills.map((bill) => (
              <li key={bill.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{bill.label}</span>
                    {bill.source === "local" ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px]" title={t("held.heldOffline")}>
                        <Smartphone className="h-3 w-3" aria-hidden />
                        {t("held.thisDevice")}
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
                      {t(bill.lineCount === 1 ? "cart.lineOne" : "cart.lines", { n: formatNumber(bill.lineCount) })} ·{" "}
                      <CurrencyDisplay amount={bill.totalAmount} />
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden />
                      {heldAgo(bill.parkedAtUtc, now, t, (v) => formatNumber(v))}
                      {bill.parkedByName ? ` ${t("held.byName", { name: bill.parkedByName })}` : ""}
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onRecall(bill)}
                  disabled={cartHasItems || busyId !== null}
                  loading={busyId === bill.id}
                  aria-label={t("held.recallName", { name: bill.label })}
                >
                  {t("held.recall")}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => onDiscard(bill)}
                  disabled={busyId !== null}
                  aria-label={t("held.discardName", { name: bill.label })}
                  title={t("held.discard")}

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
