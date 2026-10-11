"use client"

import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { PrintDocumentDialog } from "@/features/sales/components/print-document-dialog"
import { buildInvoicePrintHtml, type InvoicePaperFormat } from "@/features/sales/lib/invoice-print"
import { catalogDotnetApi } from "@/lib/api/catalog-api"
import { getRefundOnDotnet, getSaleOnDotnet, recordRefundPrintOnDotnet } from "@/lib/api/sales-api"

const REFUND_METHOD_LABELS: Record<string, string> = {
  original_payment: "Original payment method",
  cash: "cash",
  card: "card",
  bank: "bank",
  store_credit: "Store credit",
}

interface CreditNotePrintDialogProps {
  refundId: string | null
  open: boolean
  onClose: () => void
}

/**
 * IRD credit-note print for a refund: the sequential CN number, the invoice it reverses, the refunded
 * lines with their VAT split (from the original sale) and "COPY OF ORIGINAL" on reprints. Shares the
 * paper picker, preview and record-then-print flow with invoices (PrintDocumentDialog).
 */
export function CreditNotePrintDialog({ refundId, open, onClose }: CreditNotePrintDialogProps) {
  const queryClient = useQueryClient()
  const { profile } = usePharmacyProfile()
  const { data: settings } = useSystemSettings()
  const { branches } = useBranchAccess()
  const footerNote = settings?.find((s) => s.key === "pharmacy.receipt_footer")?.value ?? null

  const refundQuery = useQuery({
    queryKey: ["refunds", "credit-note", refundId],
    queryFn: () => getRefundOnDotnet(refundId!),
    enabled: open && Boolean(refundId),
    staleTime: 0,
  })
  const refund = refundQuery.data

  // The original sale supplies the buyer; refund lines carry only medicine ids, so names are looked up.
  const saleQuery = useQuery({
    queryKey: ["sales", "invoice", refund?.original_sale_id],
    queryFn: () => getSaleOnDotnet(refund!.original_sale_id),
    enabled: open && Boolean(refund?.original_sale_id),
    retry: false,
  })
  const medicineIds = [...new Set((refund?.refund_items ?? []).map((i) => i.medicine_id).filter((id): id is string => Boolean(id)))]
  const namesQuery = useQuery({
    queryKey: ["medicines", "names", medicineIds],
    queryFn: async () => {
      const rows = await Promise.all(medicineIds.map((id) => catalogDotnetApi.findMedicine(id).catch(() => null)))
      return new Map(
        rows.filter((m): m is NonNullable<typeof m> => m != null).map((m) => [m.id, { name: m.name, detail: [m.strength, m.form].filter(Boolean).join(" ") }]),
      )
    },
    enabled: open && medicineIds.length > 0,
    staleTime: 5 * 60_000,
  })

  const buildHtml = useCallback(
    (printNumber: number, format: InvoicePaperFormat): string | null => {
      if (!refund?.credit_note_number) return null
      const names = namesQuery.data
      const customer = saleQuery.data?.customers
      const method = refund.refund_method ?? "original_payment"
      return buildInvoicePrintHtml({
        kind: "credit-note",
        againstInvoice: refund.sales?.invoice_number ?? null,
        reason: refund.refund_reason,
        profile,
        branchName: branches.find((b) => b.id === refund.branch_id)?.name ?? null,
        invoiceNumber: refund.credit_note_number,
        fiscalYear: refund.fiscal_year ?? null,
        saleDate: refund.refund_date,
        buyerName: customer ? `${customer.first_name} ${customer.last_name}`.trim() : null,
        buyerPhone: customer?.phone ?? null,
        lines: refund.refund_items.map((item) => {
          const unitPrice = Number(item.sale_items?.unit_price ?? 0)
          const known = item.medicine_id ? names?.get(item.medicine_id) : undefined
          return {
            name: known?.name ?? item.sale_items?.medicines?.name ?? "Item",
            detail: known?.detail || null,
            quantity: item.quantity_refunded,
            unitPrice,
            discount: 0,
            total: Number(item.refund_amount),
            taxable: item.is_taxable ?? true,
          }
        }),
        vat:
          refund.vat_rate_percent != null && refund.taxable_amount != null
            ? {
                ratePercent: refund.vat_rate_percent,
                taxableAmount: refund.taxable_amount,
                vatAmount: refund.vat_amount ?? 0,
                exemptAmount: refund.exempt_amount ?? 0,
              }
            : null,
        total: Number(refund.net_refund_amount),
        payments: [{ method: REFUND_METHOD_LABELS[method] ?? method, amount: Number(refund.net_refund_amount) }],
        footerNote,
        printNumber,
        format,
      })
    },
    [refund, namesQuery.data, saleQuery.data, profile, branches, footerNote],
  )

  const recordPrint = useCallback(
    async (format: InvoicePaperFormat) => {
      const recorded = await recordRefundPrintOnDotnet(refundId!, format)
      void queryClient.invalidateQueries({ queryKey: ["refunds", "credit-note", refundId] })
      return recorded.printNumber
    },
    [refundId, queryClient],
  )

  return (
    <PrintDocumentDialog
      open={open}
      onClose={onClose}
      title="Print credit note"
      noun="credit note"
      documentNumber={refund?.credit_note_number}
      loading={refundQuery.isLoading || namesQuery.isLoading}
      nextPrintNumber={(refund?.print_count ?? 0) + 1}
      buildHtml={buildHtml}
      recordPrint={refund?.credit_note_number ? recordPrint : null}
    />
  )
}
