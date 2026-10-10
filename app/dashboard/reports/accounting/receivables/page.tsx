"use client"

import PayablesTab from "../tabs/payables-tab"
import ReceivablesTab from "../tabs/receivables-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"

/** Receivables & payables: receivables (default) | payables. */
export default function ReceivablesAndPayablesPage() {
  const ctx = useAccountingContext()
  return (
    <>
      <AccountingTabPanel view="receivables">
        <ReceivablesTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="payables">
        <PayablesTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
    </>
  )
}
