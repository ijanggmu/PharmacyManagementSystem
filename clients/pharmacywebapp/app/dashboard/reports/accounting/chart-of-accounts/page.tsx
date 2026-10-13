"use client"

import ChartOfAccountsTab from "../tabs/chart-of-accounts-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"
import { OpeningBalancesPanel } from "@/features/accounting/components/opening-balances-panel"
import { PaymentAccountsPanel } from "@/features/accounting/components/payment-accounts-panel"
import { TdsSettingsPanel } from "@/features/accounting/components/tds-settings-panel"

/** Finance setup: accounts (default) | payment-accounts (Accounts.View to view, Accounts.Update to change) | tds-rates (Accounts.Update to change) | opening-balances (accounting read to view; Set/Edit/Reset need ManageOpeningBalances). */
export default function FinanceSetupPage() {
  const ctx = useAccountingContext()
  return (
    <>
      <AccountingTabPanel view="accounts">
        <ChartOfAccountsTab accounts={ctx.accounts} setAccounts={ctx.setAccounts} accountsLoading={ctx.accountsLoading} />
      </AccountingTabPanel>
      <AccountingTabPanel view="payment-accounts">
        <PaymentAccountsPanel accounts={ctx.accounts} setAccounts={ctx.setAccounts} accountsLoading={ctx.accountsLoading} />
      </AccountingTabPanel>
      <AccountingTabPanel view="tds-rates">
        <TdsSettingsPanel />
      </AccountingTabPanel>
      <AccountingTabPanel view="opening-balances">
        <OpeningBalancesPanel
          accounts={ctx.accounts}
          accountsLoading={ctx.accountsLoading}
          branches={ctx.branches}
          branchFilterId={ctx.branchFilterId}
          branchLocked={ctx.branchLocked}
          ownBranch={ctx.ownBranch}
          branchAccessReady={ctx.branchAccessReady}
        />
      </AccountingTabPanel>
    </>
  )
}
