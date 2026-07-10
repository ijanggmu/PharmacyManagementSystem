"use client"

import PayablesTab from "../tabs/payables-tab"
import { useAccountingContext } from "../accounting-context"

export default function PayablesPage() {
  const ctx = useAccountingContext()
  return <PayablesTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
}
