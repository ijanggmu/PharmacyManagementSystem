"use client"

import PayablesTab from "../tabs/payables-tab"
import PayablesDueTab from "../tabs/payables-due-tab"
import ReceivablesTab from "../tabs/receivables-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"

/** Receivables & payables: receivables (default) | payables | payables due. */
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
      <AccountingTabPanel view="payables-due">
        <PayablesDueTab branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
    </>
  )
}
