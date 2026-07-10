"use client"

import ReconciliationTab from "../tabs/reconciliation-tab"
import { useAccountingContext } from "../accounting-context"

export default function ReconciliationPage() {
  const ctx = useAccountingContext()
  return <ReconciliationTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
}
