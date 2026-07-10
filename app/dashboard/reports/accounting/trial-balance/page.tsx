"use client"

import { useRouter } from "next/navigation"
import TrialBalanceTab from "../tabs/trial-balance-tab"
import { useAccountingContext } from "../accounting-context"

export default function TrialBalancePage() {
  const ctx = useAccountingContext()
  const router = useRouter()

  return (
    <TrialBalanceTab
      dateRange={ctx.dateRange}
      branchFilterId={ctx.branchFilterId}
      onOpenLedgerAccount={(code) => {
        void ctx.loadLedgerForAccountCode(code).then(() => {
          router.push("/dashboard/reports/accounting/ledger")
        })
      }}
    />
  )
}
