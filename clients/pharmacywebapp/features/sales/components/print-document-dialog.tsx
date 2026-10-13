"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { FileText, Printer, ReceiptText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  DEFAULT_INVOICE_PAPER,
  INVOICE_PAPER_FORMATS,
  INVOICE_PAPER_SETTING_KEY,
  isInvoicePaperFormat,
  type InvoicePaperFormat,
} from "@/features/sales/lib/invoice-print"

export interface PrintDocumentDialogProps {
  open: boolean
  onClose: () => void
  /** "Print invoice" / "Print credit note". */
  title: string
  /** Lower-case document noun for messages: "invoice", "credit note". */
  noun: string
  documentNumber?: string | null
  /** True while the document's data loads (preview shows a skeleton, Print is disabled). */
  loading: boolean
  /** What the next print will be: 0 = provisional (unrecorded), 1 = original, 2+ = copy. */
  nextPrintNumber: number
  /** Builds the full HTML for a given print number and paper; null when there is nothing to print yet. */
  buildHtml: (printNumber: number, format: InvoicePaperFormat, language: Locale) => string | null
  /** Records the print and returns its number; null for documents that can't be recorded (provisional). */
  recordPrint: ((format: InvoicePaperFormat) => Promise<number>) | null
  /** Extra notices shown under the paper picker (e.g. provisional warning). */
  notices?: ReactNode
}

/**
 * Shared print flow for IRD documents (invoices, credit notes): paper picker defaulting to the shop
 * setting, an exact preview (the same HTML that prints, in a sandboxed iframe), and a print step that
 * records the print first so reprints carry "COPY OF ORIGINAL — n".
 */
export function PrintDocumentDialog({
  open,
  onClose,
  title,
  noun,
  documentNumber,
  loading,
  nextPrintNumber,
  buildHtml,
  recordPrint,
  notices,
}: PrintDocumentDialogProps) {
  const { toast } = useToast()
  const t = useTranslations("pos")
  const tc = useTranslations("common")
  const { formatNumber, locale } = useI18n()
  const tp = useTranslations("print")
  const { profile } = usePharmacyProfile()
  const { data: settings } = useSystemSettings()
  const [format, setFormat] = useState<InvoicePaperFormat>(DEFAULT_INVOICE_PAPER)
  const [printing, setPrinting] = useState(false)
  // Print language: starts at the UI language each open; a Nepali UI can still print an English bill.
  const [language, setLanguage] = useState<Locale>(locale)

  const savedPaper = settings?.find((s) => s.key === INVOICE_PAPER_SETTING_KEY)?.value ?? null

  // Each open starts from the shop's default paper size.
  useEffect(() => {
    if (open) setFormat(isInvoicePaperFormat(savedPaper) ? savedPaper : DEFAULT_INVOICE_PAPER)
  }, [open, savedPaper])

  useEffect(() => {
    if (open) setLanguage(locale)
  }, [open, locale])

  const previewDoc = useMemo(() => (loading ? null : buildHtml(nextPrintNumber, format, language)), [loading, buildHtml, nextPrintNumber, format, language])

  const handlePrint = async () => {
    setPrinting(true)
    try {
      const printNumber = recordPrint ? await recordPrint(format) : 0
      const html = buildHtml(printNumber, format, language)
      if (!html) throw new Error(t("printing.nothingToPrint", { doc: noun }))
      await printHtmlDocument(html)
      toast({
        title:
          printNumber > 1
            ? t("printing.copySent", { n: formatNumber(printNumber - 1) })
            : printNumber === 0
              ? t("printing.provisionalSent", { doc: noun })
              : t("printing.sent", { doc: `${noun.charAt(0).toUpperCase()}${noun.slice(1)}` }),
      })
    } catch (error) {
      toast({ title: t("printing.failed", { doc: noun }), description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !printing && onClose()}>
      <DialogContent className="flex max-h-[min(92vh,920px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ReceiptText className="size-5 text-primary" aria-hidden />
            {title}
            {documentNumber && <span className="font-mono text-sm font-medium text-muted-foreground">{documentNumber}</span>}
            {nextPrintNumber > 1 && <Badge variant="warning">{t("printing.reprintCopy", { n: formatNumber(nextPrintNumber - 1) })}</Badge>}
          </DialogTitle>
          <DialogDescription>{t("printing.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[220px_1fr]">
          <div className="space-y-5 border-b p-5 md:border-b-0 md:border-r">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("printing.paperSize")}</legend>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-1" role="radiogroup" aria-label={t("printing.paperSize")}>
                {INVOICE_PAPER_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={format === f.value}
                    onClick={() => setFormat(f.value)}
                    className={cn(
                      "flex cursor-pointer flex-col items-start rounded-lg border px-3 py-2 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      format === f.value ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "hover:bg-accent",
                    )}
                  >
                    <span className="text-sm font-semibold">{f.label}</span>
                    <span className="text-xs text-muted-foreground">{t(`printing.paper.${f.value}`)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">{tp("dialog.language")}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tp("dialog.language")}>
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    lang={l}
                    aria-checked={language === l}
                    onClick={() => setLanguage(l)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      language === l ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "hover:bg-accent",
                    )}
                  >
                    {LOCALE_LABELS[l]}
                  </button>
                ))}
              </div>
            </fieldset>

            {notices}
            {!profile.panVat && (
              <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("printing.addPan", { doc: noun })}
              </p>
            )}
          </div>

          <div className="min-h-0 overflow-auto bg-muted/50 p-5">
            {loading || !previewDoc ? (
              <div className="mx-auto w-[300px] space-y-2 rounded-md bg-card p-4 shadow-sm" aria-busy="true">
                <span className="sr-only">{t("printing.loadingPreview")}</span>
                <Skeleton className="mx-auto h-5 w-40" />
                <Skeleton className="mx-auto h-3 w-28" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <iframe
                title={t("printing.previewTitle", { title })}
                srcDoc={previewDoc}
                sandbox=""
                className={cn(
                  "mx-auto block rounded-md bg-white shadow-md ring-1 ring-border transition-[width] duration-300 ease-out",
                  format === "thermal-58" && "h-[560px] w-[240px]",
                  format === "thermal-80" && "h-[600px] w-[320px]",
                  format === "a5" && "h-[640px] w-full max-w-[520px]",
                )}
              />
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={onClose} disabled={printing}>
            {tc("actions.close")}
          </Button>
          <Button onClick={() => void handlePrint()} loading={printing} loadingText={t("printing.printing")} disabled={loading || !previewDoc}>
            {!printing && <Printer aria-hidden />}
            {nextPrintNumber > 1 ? t("printing.printCopy") : tc("actions.print")}

          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
