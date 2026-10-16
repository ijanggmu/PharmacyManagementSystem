"use client"

import { useCallback, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { Customer } from "@/features/customers/api-client"
import { usePharmacyProfile } from "@/features/accounting/hooks/use-pharmacy-profile"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { useBranchAccess } from "@/features/branches/hooks/use-branch-access"
import { useIrdSettings } from "@/features/settings/hooks/use-ird-settings"
import { getSaleOnDotnet, recordSalePrintOnDotnet } from "@/lib/api/sales-api"
import { prescriptionsDotnet } from "@/lib/api/prescriptions-api"
import { buildInvoicePrintHtml, type InvoiceLine, type InvoicePaperFormat } from "@/features/sales/lib/invoice-print"
import { PrintDocumentDialog } from "./print-document-dialog"
import { useI18n } from "@/lib/i18n/i18n-provider"
import type { Locale } from "@/lib/i18n/config"
import { cartQuantityNote, type SaleUnit, type SaleUnits } from "@/features/sales/lib/sale-units"

interface CartItem {
  medicineId: string
  medicineName: string
  strength: string
  form: string
  quantity: number
  unitPrice: number
  totalPrice: number
  discountPercent?: number
  /** POS cart lines sold in packs (quantity is base units). */
  saleUnit?: SaleUnit
  packUnits?: SaleUnits | null
  /** Reprints: the recorded line's pack note ("2 strips (20 tablets)"), from soldQuantityNote. */
  unitNote?: string | null
}

interface SalePayment {
  payment_method: string
  amount: string
  /** Card slip / wallet / bank transaction id, when the cashier recorded one. */
  reference?: string | null
}

interface SaleData {
  id: string
  sale_number: string
  sale_date: string
  payment_method: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  items: CartItem[]
  customer: Customer | null
  subtotal: number
  taxAmount: number
  total: number
  staffName?: string
  sale_payments?: SalePayment[]
  /** Cash handed over plus non-cash amounts; only set for a sale just taken at the POS. */
  amount_tendered?: number
  change_due?: number
}

interface PrintReceiptProps {
  isOpen: boolean
  onClose: () => void
  saleData: SaleData | null
}

/**
 * IRD invoice print for POS checkout and reprints. The sale is re-read from the API so the invoice
 * number, fiscal year and VAT split are the server's (the POS only knows its cart). Each print is
 * recorded first; the returned print number drives the "COPY OF ORIGINAL" marking. When the sale
 * can't be read (e.g. an offline sale not yet synced) a clearly-marked provisional receipt prints instead.
 */
export default function PrintReceipt({ isOpen, onClose, saleData }: PrintReceiptProps) {
  const queryClient = useQueryClient()
  const { profile } = usePharmacyProfile()
  const { data: settings } = useSystemSettings()
  const { branches } = useBranchAccess()
  const { data: irdSettings } = useIrdSettings()
  // Prints in the UI language unless the dialog picks another one.
  const { locale, nepaliDigits } = useI18n()
  const footerNote = settings?.find((s) => s.key === "pharmacy.receipt_footer")?.value ?? null

  const saleQuery = useQuery({
    queryKey: ["sales", "invoice", saleData?.id],
    queryFn: () => getSaleOnDotnet(saleData!.id),
    enabled: isOpen && Boolean(saleData?.id),
    retry: false,
    staleTime: 0,
  })
  const sale = saleQuery.data
  // The prescription the sale dispensed against: its number and the prescriber print on the invoice (DDA
  // practice for prescription and controlled medicines). Read for reprints too, not only at checkout.
  const prescriptionId = sale?.prescription_id ?? null
  const prescriptionQuery = useQuery({
    queryKey: ["prescriptions", "invoice", prescriptionId],
    queryFn: () => prescriptionsDotnet.get(prescriptionId!),
    enabled: isOpen && Boolean(prescriptionId),
    retry: false,
    staleTime: 60_000,
  })
  const prescription = prescriptionQuery.data
  // Provisional only when the server doesn't have the sale (e.g. an offline sale not yet synced).
  // A sale recorded before sequential numbering gets its number issued by its first print.
  const provisional = saleQuery.isError
  // Number issued by the print that is in flight (read when the final HTML is built).
  const issuedNumber = useRef<string | null>(null)
  if (!isOpen) issuedNumber.current = null

  const buildHtml = useCallback(
    (printNumber: number, format: InvoicePaperFormat, language: Locale = locale): string | null => {
      if (!saleData) return null
      const taxableByMedicine = new Map((sale?.sale_items ?? []).map((i) => [i.medicine_id, i.is_taxable ?? true]))
      const lines: InvoiceLine[] = saleData.items.map((item) => ({
        name: item.medicineName,
        detail: [item.strength, item.form].filter(Boolean).join(" ") || null,
        quantity: item.quantity,
        unitNote: item.unitNote ?? cartQuantityNote(item),
        unitPrice: item.unitPrice,
        discount: Math.max(0, item.quantity * item.unitPrice - item.totalPrice),
        total: item.totalPrice,
        taxable: taxableByMedicine.get(item.medicineId) ?? true,
      }))
      const hasVat = sale != null && sale.vat_rate_percent != null && sale.taxable_amount != null
      return buildInvoicePrintHtml({
        profile,
        branchName: branches.find((b) => b.id === sale?.branch_id)?.name ?? null,
        invoiceNumber:
          // Preview of an older, not-yet-numbered sale shows a placeholder; the real print uses the issued number.
          issuedNumber.current ?? sale?.invoice_number ?? (sale ? "Issued when printed" : null),
        fiscalYear: sale?.fiscal_year ?? null,
        saleDate: sale?.sale_date ?? saleData.sale_date ?? new Date().toISOString(),
        buyerName:
          sale?.buyer_name ??
          (saleData.customer ? `${saleData.customer.first_name} ${saleData.customer.last_name}`.trim() : null),
        buyerPan: sale?.buyer_pan ?? null,
        prescription: prescription
          ? {
              number: prescription.prescriptionNumber,
              doctorName: prescription.doctorName,
              doctorLicense: prescription.doctorLicenseNumber ?? null,
            }
          : null,
        priceLevelName: sale?.price_level_name ?? null,
        abbreviatedThreshold: irdSettings?.abbreviatedInvoiceThreshold ?? null,
        buyerPhone: saleData.customer?.phone ?? null,
        lines,
        vat:
          hasVat && sale
            ? {
                ratePercent: sale.vat_rate_percent ?? 0,
                taxableAmount: sale.taxable_amount ?? 0,
                vatAmount: Number(sale.tax_amount),
                exemptAmount: sale.exempt_amount ?? 0,
              }
            : null,
        total: sale ? Number(sale.total_amount) : saleData.total,
        payments: (saleData.sale_payments?.length
          ? saleData.sale_payments
          : [{ payment_method: saleData.payment_method, amount: String(saleData.total) }]
        ).map((p) => ({ method: p.payment_method, amount: Number(p.amount), reference: p.reference ?? null })),
        amountTendered: saleData.amount_tendered ?? null,
        changeDue: saleData.change_due ?? null,
        cashier: saleData.staffName ?? null,
        footerNote,
        printNumber,
        format,
        language,
        nepaliDigits,
      })
    },
    [saleData, sale, prescription, profile, branches, footerNote, irdSettings, locale, nepaliDigits],
  )

  const recordPrint = useCallback(
    async (format: InvoicePaperFormat) => {
      const recorded = await recordSalePrintOnDotnet(saleData!.id, format)
      issuedNumber.current = recorded.invoiceNumber ?? null
      void queryClient.invalidateQueries({ queryKey: ["sales", "invoice", saleData!.id] })
      return recorded.printNumber
    },
    [saleData, queryClient],
  )

  if (!saleData) return null

  return (
    <PrintDocumentDialog
      open={isOpen}
      onClose={onClose}
      title="Print invoice"
      noun="invoice"
      documentNumber={sale?.invoice_number}
      loading={saleQuery.isLoading}
      // Preview shows what this print will be: original if never printed, otherwise the next copy.
      nextPrintNumber={provisional ? 0 : (sale?.print_count ?? 0) + 1}
      buildHtml={buildHtml}
      recordPrint={provisional ? null : recordPrint}
      notices={
        provisional && !saleQuery.isLoading ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            This sale has no IRD invoice number yet (it may still be syncing). A provisional receipt will print — reprint the
            invoice from Sales once it syncs.
          </p>
        ) : null
      }
    />
  )
}
