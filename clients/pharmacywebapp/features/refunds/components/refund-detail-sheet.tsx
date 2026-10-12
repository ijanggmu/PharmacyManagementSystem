"use client"

import type { ReactNode } from "react"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import type { Refund } from "@/features/refunds/api-client"

const METHOD_LABEL: Record<string, string> = {
  original_payment: "Original payment method",
  cash: "Cash",
  card: "Card",
  bank: "Bank",
  store_credit: "Store credit",
}

/** Right-side details for one refund: lines paid back, the VAT reversed and the credit note. */
export function RefundDetailSheet({
  refund,
  onOpenChange,
  statusBadge,
  branchName,
  onPrintCreditNote,
}: {
  refund: Refund | null
  onOpenChange: (open: boolean) => void
  /** The table's status badge, so the sheet and the row always agree. */
  statusBadge: (status: Refund["status"]) => ReactNode
  branchName?: (branchId: string | null | undefined) => string
  onPrintCreditNote?: (refund: Refund) => void
}) {
  const r = refund
  const customer = r?.customers ? `${r.customers.first_name} ${r.customers.last_name}`.trim() : ""
  const total = r ? r.total_refund_amount || r.net_refund_amount || "0" : "0"
  const method = r?.refund_method ? (METHOD_LABEL[r.refund_method] ?? r.refund_method.replace(/_/g, " ")) : null
  const canPrint = !!r?.credit_note_number && r.status !== "rejected" && !!onPrintCreditNote

  return (
    <DetailSheet
      open={!!r}
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{r?.refund_number ?? "Refund"}</span>}
      srTitle={r ? `Refund ${r.refund_number}` : "Refund details"}
      badges={r && statusBadge(r.status)}
      description={
        r && (
          <span className="num">
            Against sale {r.sales?.sale_number ?? "—"}
            {r.return_id ? " · pays out a return" : ""}
          </span>
        )
      }
      footer={
        canPrint && r ? (
          <Button onClick={() => onPrintCreditNote?.(r)}>
            <Printer aria-hidden />
            Print credit note
          </Button>
        ) : undefined
      }
    >
      {r && (
        <>
          <DetailFields columns={3}>
            <DetailField label="Refund date">
              <span className="num">{new Date(r.refund_date).toLocaleDateString()}</span>
            </DetailField>
            <DetailField label="Sale / invoice" mono>
              {r.sales?.sale_number}
              {r.sales?.invoice_number && <span className="block text-xs text-muted-foreground">{r.sales.invoice_number}</span>}
            </DetailField>
            <DetailField label="Credit note" mono>
              {r.credit_note_number}
              {r.fiscal_year && <span className="block text-xs text-muted-foreground">FY {r.fiscal_year}</span>}
            </DetailField>
            <DetailField label="Customer">
              {customer || "Walk-in"}
              {r.customers?.phone && <span className="num block text-xs text-muted-foreground">{r.customers.phone}</span>}
            </DetailField>
            <DetailField label="Paid back by">{method}</DetailField>
            {branchName && <DetailField label="Branch">{branchName(r.branch_id)}</DetailField>}
          </DetailFields>

          <DetailSection title="Items">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Medicine</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.refund_items.map((item) => {
                    const med = item.sale_items?.medicines
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{med?.name ?? <span className="text-muted-foreground">Unknown medicine</span>}</div>
                          <div className="text-xs text-muted-foreground">
                            {[med?.strength, med?.form].filter(Boolean).join(" · ")}
                            {item.is_taxable === false ? " · VAT exempt" : ""}
                          </div>
                        </TableCell>
                        <TableCell className="num text-right">
                          {item.quantity_refunded}
                          {item.sale_items && <span className="text-muted-foreground"> / {item.sale_items.quantity}</span>}
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-right font-medium">
                          <CurrencyDisplay amount={item.refund_amount} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <dl className="space-y-1.5 rounded-lg border p-3 text-sm">
              {r.taxable_amount != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Taxable amount</dt>
                  <dd className="num"><CurrencyDisplay amount={r.taxable_amount} /></dd>
                </div>
              )}
              {r.vat_amount != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    VAT reversed{r.vat_rate_percent != null ? ` (${r.vat_rate_percent}%, included)` : ""}
                  </dt>
                  <dd className="num"><CurrencyDisplay amount={r.vat_amount} /></dd>
                </div>
              )}
              {r.exempt_amount != null && r.exempt_amount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">VAT-exempt</dt>
                  <dd className="num"><CurrencyDisplay amount={r.exempt_amount} /></dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 pt-1">
                <dt className="font-semibold">Total refunded</dt>
                <dd className="num font-display text-xl font-bold"><CurrencyDisplay amount={total} /></dd>
              </div>
            </dl>
          </DetailSection>

          {(r.reason || r.refund_reason || r.notes) && (
            <DetailSection title="Reason">
              {(r.reason || r.refund_reason) && <p className="text-sm">{r.reason || r.refund_reason}</p>}
              {r.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.notes}</p>}
            </DetailSection>
          )}
        </>
      )}
    </DetailSheet>
  )
}
