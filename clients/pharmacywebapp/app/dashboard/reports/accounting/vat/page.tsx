"use client"

import VatReturnTab from "../tabs/vat-return-tab"
import TdsReportTab from "../tabs/tds-report-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"
import { IrdReportsPanel } from "@/features/accounting/components/ird-reports-panel"

/** Tax & IRD: vat (default) | tds (TDS withheld + deposits) | ird (reports:read only — the standalone IRD page's gate). */
export default function TaxAndIrdPage() {
  const ctx = useAccountingContext()
  return (
    <>
      <AccountingTabPanel view="vat">
        <VatReturnTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="tds">
        <TdsReportTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="ird">
        <IrdReportsPanel embedded />
      </AccountingTabPanel>
    </>
  )
}
