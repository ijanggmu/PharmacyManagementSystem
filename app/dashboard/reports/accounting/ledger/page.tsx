"use client"

import GeneralLedgerTab from "../tabs/general-ledger-tab"
import { useAccountingContext } from "../accounting-context"

export default function LedgerPage() {
  const ctx = useAccountingContext()
  return (
    <GeneralLedgerTab
      dateRange={ctx.dateRange}
      branchFilterId={ctx.branchFilterId}
      accounts={ctx.accounts}
      accountsLoading={ctx.accountsLoading}
      glAccountId={ctx.glAccountId}
      setGlAccountId={ctx.setGlAccountId}
      glRows={ctx.glRows}
      setGlRows={ctx.setGlRows}
      glOpening={ctx.glOpening}
      setGlOpening={ctx.setGlOpening}
      glLoading={ctx.glLoading}
      setGlLoading={ctx.setGlLoading}
    />
  )
}
