"use client"

import CashBankTab from "../tabs/cash-bank-tab"
import { useAccountingContext } from "../accounting-context"

export default function CashBankPage() {
  const ctx = useAccountingContext()
  return <CashBankTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
}
