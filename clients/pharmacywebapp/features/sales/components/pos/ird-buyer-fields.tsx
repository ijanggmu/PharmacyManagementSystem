"use client"

import { AlertTriangle, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { buyerDetailsIssue, irdInvoiceType } from "@/lib/api/ird-api"
import { useTranslations } from "@/lib/i18n/i18n-provider"

/**
 * Buyer name / PAN for the IRD tax invoice. Shows which invoice the bill will print as (Abbreviated Tax Invoice up
 * to the tenant's limit without a PAN) and warns when a bill above the limit has no buyer name.
 */
export function IrdBuyerFields({
  total,
  threshold,
  buyerName,
  buyerPan,
  onChange,
  disabled,
}: {
  total: number
  threshold: number
  buyerName: string
  buyerPan: string
  onChange: (patch: { buyerName?: string; buyerPan?: string }) => void
  disabled?: boolean
}) {
  const t = useTranslations("pos")
  const issue = buyerDetailsIssue(total, buyerName, buyerPan, threshold)
  const abbreviated = irdInvoiceType(total, buyerPan, threshold) === "abbreviated_tax_invoice"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("buyer.title")}</span>
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" aria-hidden />
          {abbreviated ? t("buyer.abbreviatedTaxInvoice") : t("buyer.taxInvoice")}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <div className="space-y-1">
          <Label htmlFor="ird-buyer-name" className="sr-only">
            {t("buyer.name")}
          </Label>
          <Input
            id="ird-buyer-name"
            placeholder={t("buyer.name")}
            maxLength={200}
            value={buyerName}
            disabled={disabled}
            onChange={(e) => onChange({ buyerName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ird-buyer-pan" className="sr-only">
            {t("buyer.pan")}
          </Label>
          <Input
            id="ird-buyer-pan"
            placeholder={t("buyer.panPlaceholder")}

            inputMode="numeric"
            maxLength={9}
            value={buyerPan}
            disabled={disabled}
            aria-invalid={issue?.level === "error"}
            onChange={(e) => onChange({ buyerPan: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>
      {issue ? (
        <p
          role={issue.level === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-1.5 text-xs font-medium",
            issue.level === "error" ? "text-destructive" : "text-warning",
          )}
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {issue.message}
        </p>
      ) : null}
    </div>
  )
}
