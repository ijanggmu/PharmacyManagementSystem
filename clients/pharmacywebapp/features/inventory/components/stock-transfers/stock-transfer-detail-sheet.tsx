"use client"

import { Ban, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DetailField, DetailFields, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StockTransfer } from "@/features/inventory/api-client-stock-transfers"
import { DualDate, TransferRoute, TransferStatusBadge } from "./transfer-parts"

/** Right-side details for one transfer, with Receive / Cancel while it is still in transit. */
export function StockTransferDetailSheet({
  transfer,
  onOpenChange,
  onReceive,
  onCancel,
  receiving,
}: {
  transfer: StockTransfer | null
  onOpenChange: (open: boolean) => void
  onReceive: (transfer: StockTransfer) => void
  onCancel: (transfer: StockTransfer) => void
  receiving: boolean
}) {
  const totalUnits = transfer?.stock_transfer_items.reduce((sum, i) => sum + i.quantity, 0) ?? 0

  return (
    <DetailSheet
      open={!!transfer}
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{transfer?.transfer_number ?? "Transfer"}</span>}
      srTitle={transfer ? `Transfer ${transfer.transfer_number}` : "Transfer details"}
      badges={transfer && <TransferStatusBadge status={transfer.status} />}
      description={transfer && <TransferRoute transfer={transfer} />}
      footer={
        transfer?.status === "in_transit" ? (
          <>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => onCancel(transfer)}>
              <Ban aria-hidden />
              Cancel transfer
            </Button>
            <Button onClick={() => onReceive(transfer)} loading={receiving} loadingText="Receiving…">
              <PackageCheck aria-hidden />
              Receive at {transfer.to_branch?.name || "destination"}
            </Button>
          </>
        ) : undefined
      }
    >
      {transfer && (
        <>
          <DetailSection title="Transfer">
            <DetailFields>
              <DetailField label="Transfer no." mono>
                {transfer.transfer_number}
              </DetailField>
              <DetailField label="Status">
                <TransferStatusBadge status={transfer.status} />
              </DetailField>
              <DetailField label="From branch">
                {transfer.from_branch?.name}
                {transfer.from_branch?.code ? <span className="ml-1 text-muted-foreground">({transfer.from_branch.code})</span> : null}
              </DetailField>
              <DetailField label="To branch">
                {transfer.to_branch?.name}
                {transfer.to_branch?.code ? <span className="ml-1 text-muted-foreground">({transfer.to_branch.code})</span> : null}
              </DetailField>
              <DetailField label="Dispatched">
                <DualDate utc={transfer.created_at} />
              </DetailField>
              {transfer.status === "completed" && (
                <DetailField label="Received">
                  <DualDate utc={transfer.received_at} />
                </DetailField>
              )}
              {transfer.status === "cancelled" && (
                <>
                  <DetailField label="Cancelled">
                    <DualDate utc={transfer.cancelled_at} />
                  </DetailField>
                  <DetailField label="Cancellation reason">{transfer.cancellation_reason}</DetailField>
                </>
              )}
              <DetailField label="Notes" className="sm:col-span-2">
                {transfer.notes}
              </DetailField>
            </DetailFields>
          </DetailSection>

          <DetailSection
            title="Medicines"
            action={
              <span className="num text-xs text-muted-foreground">
                {transfer.stock_transfer_items.length} line{transfer.stock_transfer_items.length === 1 ? "" : "s"} · {totalUnits} units
              </span>
            }
          >
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfer.stock_transfer_items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className="num text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{item.medicines?.name ?? "Medicine"}</TableCell>
                      <TableCell className="num text-right">{item.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DetailSection>
        </>
      )}
    </DetailSheet>
  )
}
