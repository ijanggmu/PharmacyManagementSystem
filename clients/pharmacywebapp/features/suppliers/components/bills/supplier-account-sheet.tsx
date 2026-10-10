"use client"

import { useQuery } from "@tanstack/react-query"
import { Download, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DetailFields, DetailField, DetailSection, DetailSheet } from "@/components/ui/detail-sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatBsYmd } from "@/features/accounting/lib/date-presets"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { QueryState } from "@/features/accounting/components/accounting-ui"
import { suppliersDotnetApi, type SupplierOpenBill } from "@/lib/api/suppliers-api"
import { SupplierOpenBillsTable } from "./supplier-open-bills-table"
import { SupplierLedgerTable } from "./supplier-ledger-table"

export interface SupplierAccountSheetProps {
  supplier: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
  /** Branch filter from the report; null = all branches. */
  branchId?: string | null
  /** Statement period, "YYYY-MM-DD". */
  period?: { from: string; to: string } | null
  onPayBill: (bill: SupplierOpenBill) => void
  onRecordPayment: () => void
  onExportStatement?: () => void
  exporting?: boolean
}

function StatementSummary({ supplierId, period, branchId }: { supplierId: string; period: { from: string; to: string }; branchId?: string | null }) {
  const { money } = useAccountingMoney()
  const statement = useQuery({
    queryKey: ["suppliers", "statement", supplierId, period.from, period.to, branchId ?? "all"],
    queryFn: () => suppliersDotnetApi.statement(supplierId, period.from, period.to, branchId),
    staleTime: 15_000,
  })
  const s = statement.data
  const billed = s?.lines.reduce((t, l) => t + l.debit, 0) ?? 0
  const settled = s?.lines.reduce((t, l) => t + l.credit, 0) ?? 0

  return (
    <QueryState
      isLoading={statement.isLoading}
      error={statement.error}
      onRetry={() => void statement.refetch()}
      retrying={statement.isFetching}
      errorTitle="Couldn't load the statement"
    >
      <DetailFields columns={2}>
        <DetailField label="Period">
          <span className="num">
            {period.from} → {period.to}
          </span>
          <span className="block text-xs text-muted-foreground">
            BS {formatBsYmd(period.from)} → {formatBsYmd(period.to)}
          </span>
        </DetailField>
        <DetailField label="Entries">{s ? s.lines.length : null}</DetailField>
        <DetailField label="Opening balance" mono>
          {s ? money(s.opening_balance) : null}
        </DetailField>
        <DetailField label="Billed in period" mono>
          {s ? money(billed) : null}
        </DetailField>
        <DetailField label="Paid / returned in period" mono>
          {s ? money(settled) : null}
        </DetailField>
        <DetailField label="Closing balance" mono>
          {s ? <span className="font-semibold">{money(s.closing_balance)}</span> : null}
        </DetailField>
      </DetailFields>
    </QueryState>
  )
}

/**
 * Right-side account view for one supplier (Payables): open bills with "Pay", the full ledger with
 * receipt and supplier bill numbers, and the statement summary for the report period.
 */
export function SupplierAccountSheet({
  supplier,
  onOpenChange,
  branchId,
  period,
  onPayBill,
  onRecordPayment,
  onExportStatement,
  exporting,
}: SupplierAccountSheetProps) {
  return (
    <DetailSheet
      open={!!supplier}
      onOpenChange={onOpenChange}
      title={supplier?.name ?? "Supplier"}
      description="Bills, payments and returns. Pay a single bill, or record a payment that settles the oldest bills first."
      size="xl"
      footer={
        <>
          {onExportStatement && (
            <Button variant="outline" onClick={onExportStatement} loading={exporting} disabled={!period}>
              {!exporting && <Download aria-hidden />}
              Statement CSV
            </Button>
          )}
          <Button onClick={onRecordPayment}>
            <Send aria-hidden />
            Record payment
          </Button>
        </>
      }
    >
      {supplier && (
        <Tabs defaultValue="bills" className="gap-4">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="bills">Open bills</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="statement">Statement</TabsTrigger>
          </TabsList>
          <TabsContent value="bills">
            <SupplierOpenBillsTable supplierId={supplier.id} branchId={branchId} onPay={onPayBill} />
          </TabsContent>
          <TabsContent value="ledger">
            <SupplierLedgerTable supplierId={supplier.id} branchId={branchId} />
          </TabsContent>
          <TabsContent value="statement">
            {period ? (
              <DetailSection title="Statement summary">
                <StatementSummary supplierId={supplier.id} period={period} branchId={branchId} />
              </DetailSection>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a report period to see the statement.</p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </DetailSheet>
  )
}
