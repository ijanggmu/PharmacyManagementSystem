"use client"

import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface QrCodeImageProps {
  /** Text to encode (e.g. Fonepay's EMV qrMessage). */
  value: string
  /** Accessible description of what the QR pays. */
  label: string
  size?: number
  className?: string
}

/** Renders `value` as a QR image. The ~50 KB qrcode lib is only loaded when a QR is shown. */
export function QrCodeImage({ value, label, size = 224, className }: QrCodeImageProps) {
  const [rendered, setRendered] = useState<{ value: string; dataUrl: string | null; failed: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: size * 2, color: { dark: "#000000", light: "#ffffff" } }),
      )
      .then((dataUrl) => {
        if (!cancelled) setRendered({ value, dataUrl, failed: false })
      })
      .catch(() => {
        if (!cancelled) setRendered({ value, dataUrl: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  const current = rendered?.value === value ? rendered : null

  if (current?.failed) {
    return (
      <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Couldn&apos;t draw the QR code. Regenerate to try again.
      </p>
    )
  }

  if (!current?.dataUrl) {
    return (
      <div
        role="img"
        aria-label="Drawing QR code"
        className={cn("animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- locally generated data URL
    <img
      src={current.dataUrl}
      alt={label}
      width={size}
      height={size}
      className={cn("rounded-lg bg-white p-2 ring-1 ring-border", className)}
    />
  )
}
