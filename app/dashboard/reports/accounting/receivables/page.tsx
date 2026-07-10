"use client"

import ReceivablesTab from "../tabs/receivables-tab"
import { useAccountingContext } from "../accounting-context"

export default function ReceivablesPage() {
  const ctx = useAccountingContext()
  return <ReceivablesTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
}
