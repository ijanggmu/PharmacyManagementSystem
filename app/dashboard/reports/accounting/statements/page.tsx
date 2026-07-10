"use client"

import FinancialStatementsTab from "../tabs/financial-statements-tab"
import { useAccountingContext } from "../accounting-context"

export default function StatementsPage() {
  const ctx = useAccountingContext()
  return (
    <FinancialStatementsTab
      dateRange={ctx.dateRange}
      branchFilterId={ctx.branchFilterId}
      lockDate={ctx.lockDate}
      lockDraft={ctx.lockDraft}
      setLockDraft={ctx.setLockDraft}
      lockSaving={ctx.lockSaving}
      setLockSaving={ctx.setLockSaving}
      setLockDate={ctx.setLockDate}
    />
  )
}
