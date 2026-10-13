"use client"

import BankReconciliationTab from "../tabs/bank-reconciliation-tab"
import CashBankTab from "../tabs/cash-bank-tab"
import ChequeRegisterTab from "../tabs/cheque-register-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"

/** Cash & bank: cash (default) | cheques | bank-reconciliation. */
export default function CashAndBankPage() {
  const ctx = useAccountingContext()
  return (
    <>
      <AccountingTabPanel view="cash">
        <CashBankTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="cheques">
        <ChequeRegisterTab />
      </AccountingTabPanel>
      <AccountingTabPanel view="bank-reconciliation">
        <BankReconciliationTab />
      </AccountingTabPanel>
    </>
  )
}
