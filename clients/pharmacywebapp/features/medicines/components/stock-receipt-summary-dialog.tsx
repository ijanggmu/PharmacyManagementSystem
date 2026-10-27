"use client"

/**
 * Receipt details shown right after Add medicine or Bulk import receives stock: per supplier bill, each line's
 * batch, expiry, quantity, cost, VAT and value, then the bill total, so the user can check it against the paper bill.
 */

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DIALOG_CONTENT_DETAIL_CLASS } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CurrencyDisplay } from "@/components/currency-display"
import { formatDate } from "@/lib/utils/formatting"
import {
  lineValue,
  receivedStockTotals,
  type ReceivedStockBill,
} from "@/features/medicines/lib/stock-receipt-summary"

function BillTotals({ bill }: { bill: ReceivedStockBill }) {
  const totals = receivedStockTotals(bill.lines)
  const rows: Array<[string, number, boolean?]> = [
    ["Goods value", totals.goods],
    ["VAT", totals.vat],
    [bill.supplierName ? "Bill total" : "Stock value", totals.total, true],
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

export function StockReceiptSummaryDialog({
  bills,
  onClose,
}: {
  /** Null (or empty) keeps the dialog closed. */
  bills: ReceivedStockBill[] | null
  onClose: () => void
}) {
  const open = !!bills && bills.length > 0
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
        <DialogHeader>
          <DialogTitle>Stock received</DialogTitle>
          <DialogDescription>
            {bills && bills.length > 1
              ? `${bills.length} bills posted. Check each against the supplier's bill.`
              : "Check this against the supplier's bill."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {(bills ?? []).map((bill, index) => (
            <section key={`${bill.supplierName ?? "none"}-${bill.invoiceNumber ?? ""}-${index}`} className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{bill.supplierName ?? "Opening stock (no supplier)"}</span>
                {bill.invoiceNumber && <span className="font-mono text-xs text-muted-foreground">Invoice {bill.invoiceNumber}</span>}
                <span className="text-muted-foreground">{formatDate(bill.receiptDate)}</span>
                {bill.paymentNote && <Badge variant="secondary">{bill.paymentNote}</Badge>}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right" title="Cost per unit, before VAT">Cost/unit</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right" title="Selling price per unit">MRP/unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bill.lines.map((line, i) => (
                      <TableRow key={`${line.medicineName}-${line.batchNumber ?? ""}-${i}`}>
                        <TableCell className="font-medium">
                          {line.medicineName}
                          {line.addedToExisting && <span className="ml-1 text-xs text-muted-foreground">(new batch)</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{line.batchNumber || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{line.expiryDate ? formatDate(line.expiryDate) : "—"}</TableCell>
                        <TableCell className="num text-right">{line.quantity.toLocaleString("en-US")}</TableCell>
                        <TableCell className="num text-right"><CurrencyDisplay amount={line.unitCost} /></TableCell>
                        <TableCell className="num text-right"><CurrencyDisplay amount={lineValue(line)} /></TableCell>
                        <TableCell className="num text-right">{line.vat > 0 ? <CurrencyDisplay amount={line.vat} /> : "—"}</TableCell>
                        <TableCell className="num text-right"><CurrencyDisplay amount={line.sellingPrice} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <BillTotals bill={bill} />
            </section>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
