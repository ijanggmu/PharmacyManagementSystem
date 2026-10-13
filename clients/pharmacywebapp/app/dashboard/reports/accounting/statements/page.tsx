"use client"

import { useRouter } from "next/navigation"
import CashFlowTab from "../tabs/cash-flow-tab"
import FinancialStatementsTab from "../tabs/financial-statements-tab"
import ReconciliationTab from "../tabs/reconciliation-tab"
import TrialBalanceTab from "../tabs/trial-balance-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"
import { LEGACY_ACCOUNTING_ROUTES } from "@/features/accounting/lib/accounting-views"

const LEDGER_HREF = `${LEGACY_ACCOUNTING_ROUTES.ledger.path}?view=${LEGACY_ACCOUNTING_ROUTES.ledger.view}`

/** Statements: profit-loss (default) | balance-sheet | cash-flow | trial-balance | reconciliation. */
export default function StatementsPage() {
  const ctx = useAccountingContext()
  const router = useRouter()

  const statementProps = {
    dateRange: ctx.dateRange,
    branchFilterId: ctx.branchFilterId,
    lockDate: ctx.lockDate,
    lockDraft: ctx.lockDraft,
    setLockDraft: ctx.setLockDraft,
    lockSaving: ctx.lockSaving,
    setLockSaving: ctx.setLockSaving,
    setLockDate: ctx.setLockDate,
  }

  return (
    <>
      <AccountingTabPanel view="profit-loss">
        <FinancialStatementsTab statement="profit-loss" {...statementProps} />
      </AccountingTabPanel>
      <AccountingTabPanel view="balance-sheet">
        <FinancialStatementsTab statement="balance-sheet" {...statementProps} />
      </AccountingTabPanel>
      <AccountingTabPanel view="cash-flow">
        <CashFlowTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="trial-balance">
        <TrialBalanceTab
          dateRange={ctx.dateRange}
          branchFilterId={ctx.branchFilterId}
          onOpenLedgerAccount={(code) => {
            void ctx.loadLedgerForAccountCode(code).then(() => {
              router.push(LEDGER_HREF)
            })
          }}
        />
      </AccountingTabPanel>
      <AccountingTabPanel view="reconciliation">
        <ReconciliationTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
    </>
  )
}
