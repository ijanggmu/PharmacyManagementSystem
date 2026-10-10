"use client"

import { useState } from "react"
import { ScrollText, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DetailSection } from "@/components/ui/detail-sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RecordPaymentDialog, type PaymentPartyPreset } from "@/features/accounting/components/record-payment-dialog"
import type { Supplier } from "@/features/suppliers/api-client"
import type { SupplierOpenBill } from "@/lib/api/suppliers-api"
import { SupplierOpenBillsTable } from "./bills/supplier-open-bills-table"
import { SupplierLedgerTable } from "./bills/supplier-ledger-table"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"

/**
 * Bills and ledger for one supplier inside the supplier details sheet: each bill with its GRN receipt
 * number, supplier bill no., amount, paid and outstanding, with "Pay" per bill; plus a compact ledger.
 * The full-width ledger dialog stays available for printing and export.
 */
export function SupplierBillsSection({ supplier, onOpenLedger }: { supplier: Supplier; onOpenLedger: () => void }) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [bill, setBill] = useState<SupplierOpenBill | null>(null)
  // Bills and ledger share one branch scope; balances are recomputed for the selected branch.
  const branchFilter = useBranchFilter()
  const party: PaymentPartyPreset = { id: supplier.id, name: supplier.name, outstanding: Number(supplier.payable_amount ?? 0) }

  const pay = (b: SupplierOpenBill | null) => {
    setBill(b)
    setPaymentOpen(true)
  }

  return (
    <DetailSection
      title="Bills & payments"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onOpenLedger}>
            <ScrollText aria-hidden />
            Full ledger
          </Button>
          <Button size="sm" onClick={() => pay(null)}>
            <Send aria-hidden />
            Record payment
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="bills" className="gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <TabsList>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          </TabsList>
          <BranchFilterSelect filter={branchFilter} id={`supplier-bills-branch-${supplier.id}`} hideLabel />
        </div>
        <TabsContent value="bills">
          <SupplierOpenBillsTable supplierId={supplier.id} branchId={branchFilter.branchId ?? null} onPay={pay} compact />
        </TabsContent>
        <TabsContent value="ledger">
          <SupplierLedgerTable supplierId={supplier.id} branchId={branchFilter.branchId ?? null} pageSize={10} compact />
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog kind="payment" open={paymentOpen} onOpenChange={setPaymentOpen} party={party} bill={bill} />
    </DetailSection>
  )
}
