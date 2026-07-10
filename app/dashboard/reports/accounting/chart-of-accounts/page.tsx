"use client"

import ChartOfAccountsTab from "../tabs/chart-of-accounts-tab"
import { useAccountingContext } from "../accounting-context"

export default function ChartOfAccountsPage() {
  const ctx = useAccountingContext()
  return <ChartOfAccountsTab accounts={ctx.accounts} setAccounts={ctx.setAccounts} />
}
