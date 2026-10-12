"use client"

import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import type { Return } from "@/features/returns/api-client"

const PACKAGING_LABEL: Record<NonNullable<Return["return_items"][number]["packaging_condition"]>, string> = {
  sealed: "Sealed",
  opened: "Opened",
  damaged: "Damaged",
}

/** Right-side details for one customer return: what came back, at what price, and whether it was restocked. */
export function ReturnDetailSheet({
  returnRecord,
  onOpenChange,
  statusBadge,
  branchName,
}: {
  returnRecord: Return | null
  onOpenChange: (open: boolean) => void
  /** The table's status badge, so the sheet and the row always agree. */
  statusBadge: (status: Return["status"]) => ReactNode
  branchName?: (branchId: string | null | undefined) => string
}) {
  const r = returnRecord
  const customer = r?.customers ? `${r.customers.first_name} ${r.customers.last_name}`.trim() : ""
  const units = r?.return_items.reduce((sum, item) => sum + item.quantity_returned, 0) ?? 0

  return (
    <DetailSheet
      open={!!r}
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{r?.return_number ?? "Return"}</span>}
      srTitle={r ? `Return ${r.return_number}` : "Return details"}
      badges={r && statusBadge(r.status)}
      description={r && <span className="num">Against sale {r.sales?.sale_number ?? "—"}</span>}
    >
      {r && (
        <>
          <DetailFields columns={3}>
            <DetailField label="Return date">
              <span className="num">{new Date(r.return_date).toLocaleDateString()}</span>
            </DetailField>
            <DetailField label="Sale no." mono>
              {r.sales?.sale_number}
            </DetailField>
            <DetailField label="Credit note" mono>
              {r.credit_note_number}
            </DetailField>
            <DetailField label="Customer">
              {customer || "Walk-in"}
              {r.customers?.phone && <span className="num block text-xs text-muted-foreground">{r.customers.phone}</span>}
            </DetailField>
            {branchName && <DetailField label="Branch">{branchName(r.branch_id)}</DetailField>}
            <DetailField label="Recorded">
              <span className="num">{new Date(r.created_at).toLocaleString()}</span>
            </DetailField>
          </DetailFields>

          <DetailSection
            title={
              <>
                Items{" "}
                <span className="num font-normal text-muted-foreground">
                  ({r.return_items.length} {r.return_items.length === 1 ? "line" : "lines"}, {units} units)
                </span>
              </>
            }
          >
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Medicine</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Packaging</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.return_items.map((item) => {
                    const med = item.sale_items?.medicines
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{med?.name ?? <span className="text-muted-foreground">Unknown medicine</span>}</div>
                          <div className="text-xs text-muted-foreground">
                            {[med?.strength, med?.form].filter(Boolean).join(" · ")}
                            {item.reason ? `${med?.strength || med?.form ? " · " : ""}${item.reason}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="num text-right">
                          {item.quantity_returned}
                          {item.sale_items && <span className="text-muted-foreground"> / {item.sale_items.quantity}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {item.packaging_condition ? PACKAGING_LABEL[item.packaging_condition] : "—"}
                            {item.restocked !== undefined && (
                              <Badge variant={item.restocked ? "success" : "muted"} className="text-[11px]">
                                {item.restocked ? "Restocked" : "Not restocked"}
                              </Badge>
                            )}
                          </div>
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
            <div className="flex items-baseline justify-between gap-4 rounded-lg border p-3 text-sm">
              <span className="font-semibold">Total refunded</span>
              <span className="num font-display text-xl font-bold">
                <CurrencyDisplay amount={r.total_return_amount} />
              </span>
            </div>
          </DetailSection>

          {(r.reason || r.notes) && (
            <DetailSection title="Reason">
              {r.reason && <p className="text-sm">{r.reason}</p>}
              {r.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.notes}</p>}
            </DetailSection>
          )}
        </>
      )}
    </DetailSheet>
  )
}
