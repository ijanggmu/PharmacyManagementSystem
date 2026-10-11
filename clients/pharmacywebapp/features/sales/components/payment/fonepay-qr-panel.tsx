"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, QrCode, RefreshCw, Timer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CurrencyDisplay } from "@/components/currency-display"
import { QrCodeImage } from "@/features/sales/components/payment/qr-code-image"
import {
  FONEPAY_POLL_TIMEOUT_MS,
  useCreateFonepayQr,
  useFonepayQrStatus,
} from "@/features/settings/hooks/use-payment-settings"
import type { FonepayQr } from "@/lib/api/payment-settings-api"
import { cn } from "@/lib/utils"

export type QrVerification = "idle" | "pending" | "verified" | "failed" | "expired"

interface FonepayQrPanelProps {
  amount: number
  /** Shown on the customer's statement (Fonepay remarks1). */
  remarks?: string
  onStatusChange: (status: QrVerification, reference?: string) => void
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/**
 * Dynamic Fonepay QR for one payment leg: generate → show QR → poll status every 3 s for up to
 * 5 minutes. Unmounting (leg removed, method changed, dialog closed) stops polling.
 */
export function FonepayQrPanel({ amount, remarks, onStatusChange }: FonepayQrPanelProps) {
  const createQr = useCreateFonepayQr()
  const [qr, setQr] = useState<FonepayQr | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const status = useFonepayQrStatus(qr?.prn ?? null, startedAt)

  const remote = status.data?.prn === qr?.prn ? status.data?.status : undefined
  const elapsed = startedAt === null ? 0 : now - startedAt
  const verification: QrVerification = !qr
    ? "idle"
    : remote === "success"
      ? "verified"
      : remote === "failed"
        ? "failed"
        : elapsed > FONEPAY_POLL_TIMEOUT_MS
          ? "expired"
          : "pending"
  const reference = status.data?.traceId ?? qr?.prn

  // Tick once a second while waiting so the countdown and expiry stay live.
  useEffect(() => {
    if (verification !== "pending") return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [verification])

  const lastReported = useRef<string>("")
  useEffect(() => {
    const key = `${verification}|${verification === "verified" ? reference : ""}`
    if (lastReported.current === key) return
    lastReported.current = key
    onStatusChange(verification, verification === "verified" ? reference : undefined)
  }, [verification, reference, onStatusChange])

  const generate = () => {
    createQr.mutate(
      { amount, remarks1: remarks },
      {
        onSuccess: (created) => {
          setQr(created)
          const t = Date.now()
          setStartedAt(t)
          setNow(t)
        },
      },
    )
  }

  const cancel = () => {
    setQr(null)
    setStartedAt(null)
    createQr.reset()
  }

  if (!qr) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <Button
          type="button"
          className="min-h-11 w-full"
          onClick={generate}
          loading={createQr.isPending}
          loadingText="Generating QR…"
          disabled={amount <= 0}
        >
          <QrCode className="h-4 w-4" aria-hidden />
          Generate Fonepay QR for <CurrencyDisplay amount={amount} className="num" />
        </Button>
        {createQr.isError ? (
          <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {createQr.error.message || "Fonepay QR could not be created."} Retry, or take payment another way.
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">The customer scans with any Fonepay-enabled bank or wallet app.</p>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3 transition-colors duration-200",
        verification === "verified" && "border-success/30 bg-success/5",
        (verification === "failed" || verification === "expired") && "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {verification === "verified" ? (
          <div className="flex h-40 w-40 shrink-0 flex-col items-center justify-center gap-2 rounded-lg bg-success/10 text-success">
            <CheckCircle2 className="h-12 w-12" aria-hidden />
            <span className="text-sm font-semibold">Paid</span>
          </div>
        ) : (
          <QrCodeImage
            value={qr.qrMessage}
            label={`Fonepay QR for ${qr.amount.toFixed(2)} rupees`}
            size={160}
            className={cn(verification !== "pending" && "opacity-40")}
          />
        )}
        <dl className="w-full min-w-0 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="num font-semibold">
              <CurrencyDisplay amount={qr.amount} />
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">PRN</dt>
            <dd className="min-w-0 truncate font-mono text-xs" title={qr.prn}>
              {qr.prn}
            </dd>
          </div>
          {verification === "verified" && status.data?.traceId ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Trace ID</dt>
              <dd className="min-w-0 truncate font-mono text-xs">{status.data.traceId}</dd>
            </div>
          ) : null}
          <div aria-live="polite" role="status" className="pt-1">
            {verification === "pending" ? (
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Waiting for payment…
                <span className="num ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" aria-hidden />
                  {formatClock(FONEPAY_POLL_TIMEOUT_MS - elapsed)}
                </span>
              </p>
            ) : verification === "verified" ? (
              <p className="flex items-center gap-1.5 font-medium text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Payment received and verified
              </p>
            ) : verification === "failed" ? (
              <p className="flex items-start gap-1.5 font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {status.data?.message || "Fonepay reported the payment failed."}
              </p>
            ) : (
              <p className="flex items-start gap-1.5 font-medium text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                QR expired with no payment. Regenerate to try again.
              </p>
            )}
            {verification === "pending" && status.isError ? (
              <p className="mt-1 text-xs text-warning">Can&apos;t reach Fonepay right now, still checking…</p>
            ) : null}
          </div>
        </dl>
      </div>
      {verification !== "verified" ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={generate}
            loading={createQr.isPending}
            loadingText="Generating…"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Regenerate
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={cancel}>
            <X className="h-4 w-4" aria-hidden />
            Cancel QR
          </Button>
        </div>
      ) : null}
    </div>
  )
}
