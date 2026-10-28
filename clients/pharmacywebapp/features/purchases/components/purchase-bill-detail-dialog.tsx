"use client"

/**
 * Detail view of a purchase order or direct receipt as the supplier's bill: each line with its free (bonus)
 * quantity, pack, trade discount, share of the bill discount, taxable value, VAT and the effective cost per
 * unit, then gross → discounts → taxable → VAT → net bill.
 */

import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { CurrencyDisplay } from "@/components/currency-display"
import { formatDate } from "@/lib/utils/formatting"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"
import { purchasesApi, type PurchaseBillView } from "@/features/purchases/api-client"
import { formatPurchaseQuantity } from "@/features/purchases/lib/purchase-bill-totals"

export interface PurchaseBillTarget {
  kind: "order" | "receipt"
  id: string
}

export const purchaseBillKeys = {
  detail: (target: PurchaseBillTarget) => ["purchases", "bill", target.kind, target.id] as const,
}

function discountText(percent: number, amount: number): string {
  if (amount <= 0) return "—"
  return percent > 0 ? `${Number(percent.toFixed(2))}%` : ""
}

function Totals({ bill }: { bill: PurchaseBillView }) {
  const rows: Array<[string, number, boolean?]> = [
    ["Gross", bill.subtotal],
    ["Line discounts", -bill.line_discount],
    [`Bill discount${bill.bill_discount_percent > 0 ? ` (${Number(bill.bill_discount_percent.toFixed(2))}%)` : ""}`, -bill.bill_discount],
    ["Taxable value", bill.taxable],
    ["VAT", bill.vat],
    ["Net bill", bill.total, true],
  ]
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
      {rows.map(([label, amount, strong]) => (
        <div key={label} className={`flex items-center justify-between gap-4 ${strong ? "border-t pt-1.5" : ""}`}>
          <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
          <dd className={`num text-right ${strong ? "text-base font-semibold" : ""}`}>
            <CurrencyDisplay amount={amount} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function PurchaseBillDetailDialog({
  target,
  onClose,
}: {
  target: PurchaseBillTarget | null
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: target ? purchaseBillKeys.detail(target) : ["purchases", "bill", "none"],
    queryFn: () =>
      target!.kind === "order" ? purchasesApi.getPurchaseOrderBill(target!.id) : purchasesApi.getDirectReceiptBill(target!.id),
    enabled: target !== null,
  })
  const bill = query.data

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>{target?.kind === "order" ? "Purchase order" : "Supplier bill"} {bill?.number ?? ""}</DialogTitle>
          <DialogDescription>
            {bill
              ? [bill.supplier_name, bill.supplier_invoice_number ? `Invoice ${bill.supplier_invoice_number}` : null, formatDate(bill.date)]
                  .filter(Boolean)
                  .join(" · ")
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        <DialogScrollBody className="space-y-4 pb-6 pt-4">
          {query.isLoading && (
            <div className="space-y-2" aria-busy aria-label="Loading bill">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {query.isError && (
            <ErrorState
              title="Could not load the bill"
              message={stockErrorMessage(query.error, "Failed to load the bill")}
              onRetry={() => void query.refetch()}
            />
          )}
          {bill && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right" title="Share of the bill discount">Bill disc.</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right" title="Cost of each unit put into stock, free ones included">Cost/unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bill.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.medicine_name || "Medicine"}</TableCell>
                        <TableCell className="font-mono text-xs">{line.batch_no ?? "—"}</TableCell>
                        <TableCell className="num whitespace-nowrap text-right">
                          {formatPurchaseQuantity(line.quantity, line.free_quantity, line.pack_size)}
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-right">
                          <CurrencyDisplay amount={line.pack_unit_cost ?? line.unit_cost} />
                          {/* The pack (or box) the line was entered in, as recorded: rate per that many units. */}
                          {line.pack_size && line.pack_size > 1 ? (
                            <span className="text-xs text-muted-foreground"> /{line.pack_size.toLocaleString("en-US")} units</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="num text-right">
                          <CurrencyDisplay amount={line.gross} />
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-right">
                          {line.discount_amount > 0 ? (
                            <>
                              <CurrencyDisplay amount={line.discount_amount} />{" "}
                              <span className="text-xs text-muted-foreground">{discountText(line.discount_percent, line.discount_amount)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="num text-right">
                          {line.bill_discount_amount > 0 ? <CurrencyDisplay amount={line.bill_discount_amount} /> : "—"}
                        </TableCell>
                        <TableCell className="num text-right">
                          <CurrencyDisplay amount={line.taxable} />
                        </TableCell>
                        <TableCell className="num text-right">
                          <CurrencyDisplay amount={line.vat} />
                        </TableCell>
                        <TableCell className="num text-right">
                          <CurrencyDisplay amount={line.effective_unit_cost} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Totals bill={bill} />
            </div>
          )}
        </DialogScrollBody>
      </DialogContent>
    </Dialog>
  )
}
