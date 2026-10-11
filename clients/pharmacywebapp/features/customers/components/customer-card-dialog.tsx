"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, CreditCard, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import type { Customer } from "@/features/customers/api-client"
import { buildCustomerCardHtml, customerCardQrDataUrl } from "@/features/customers/lib/customer-card"

interface CustomerCardDialogProps {
  customer: Customer | null
  open: boolean
  onClose: () => void
}

/**
 * Preview and print a customer's card: their number and a QR of it, so next time the cashier scans
 * the card (or types the number) instead of searching by name.
 */
export function CustomerCardDialog({ customer, open, onClose }: CustomerCardDialogProps) {
  const { toast } = useToast()
  const { profile } = usePharmacyProfile()
  const [qr, setQr] = useState<{ code: string; dataUrl: string } | null>(null)
  const [copies, setCopies] = useState("1")
  const [printing, setPrinting] = useState(false)

  const code = customer?.code ?? null
  const name = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : ""

  useEffect(() => {
    if (!open || !code) return
    let cancelled = false
    customerCardQrDataUrl(code)
      .then((dataUrl) => {
        if (!cancelled) setQr({ code, dataUrl })
      })
      .catch(() => {
        if (!cancelled) toast({ title: "Couldn't draw the QR code", variant: "destructive" })
      })
    return () => {
      cancelled = true
    }
  }, [open, code, toast])

  const html = useMemo(() => {
    if (!customer || !code || qr?.code !== code) return null
    return buildCustomerCardHtml({
      profile,
      customerName: name,
      code,
      phone: customer.phone,
      memberSince: customer.created_at,
      qrDataUrl: qr.dataUrl,
      copies: Number.parseInt(copies) || 1,
    })
  }, [customer, code, qr, profile, name, copies])

  const previewHtml = useMemo(() => {
    if (!customer || !code || qr?.code !== code) return null
    return buildCustomerCardHtml({ profile, customerName: name, code, phone: customer.phone, memberSince: customer.created_at, qrDataUrl: qr.dataUrl })
  }, [customer, code, qr, profile, name])

  const handlePrint = async () => {
    if (!html) return
    setPrinting(true)
    try {
      await printHtmlDocument(html)
    } catch (error) {
      toast({ title: "Printing failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setPrinting(false)
    }
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      toast({ title: "Customer number copied", description: code })
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !printing && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" aria-hidden />
            Customer card
          </DialogTitle>
          <DialogDescription>
            The customer shows this card at the counter; scanning its QR or typing the number selects them for the sale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 border-y bg-muted/40 px-6 py-5">
          {!code ? (
            <p className="text-sm text-muted-foreground">This customer has no number yet. Save the customer again to assign one.</p>
          ) : !previewHtml ? (
            <Skeleton className="mx-auto h-[220px] w-[340px] rounded-xl" />
          ) : (
            <iframe
              title={`Customer card for ${name}`}
              srcDoc={previewHtml}
              sandbox=""
              className="mx-auto block h-[232px] w-full max-w-[356px] rounded-xl border-0 bg-transparent"
            />
          )}

          {code && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer no.</p>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="group mt-0.5 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md font-mono text-lg font-semibold tracking-wider text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Copy customer number ${code}`}
                >
                  {code}
                  <Copy className="size-4 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                </button>
              </div>
              <div className="w-28">
                <Label htmlFor="card-copies">Copies</Label>
                <Input
                  id="card-copies"
                  type="number"
                  min={1}
                  max={10}
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3">
          <Button variant="outline" onClick={onClose} disabled={printing}>
            Close
          </Button>
          <Button onClick={() => void handlePrint()} disabled={!html || printing}>
            <Printer className="mr-1.5 size-4" aria-hidden />
            Print card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
