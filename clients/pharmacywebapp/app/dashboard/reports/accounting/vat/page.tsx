"use client"

import Link from "next/link"
import { FileSpreadsheet } from "lucide-react"
import VatReturnTab from "../tabs/vat-return-tab"
import TdsReportTab from "../tabs/tds-report-tab"
import { useAccountingContext } from "../accounting-context"
import { AccountingTabPanel } from "../accounting-view"
import { IrdReportsPanel } from "@/features/accounting/components/ird-reports-panel"
import { useTranslations } from "@/lib/i18n/i18n-provider"

/** Tax & IRD: vat (default) | tds (TDS withheld + deposits) | ird (reports:read only — the standalone IRD page's gate). */
export default function TaxAndIrdPage() {
  const ctx = useAccountingContext()
  const t = useTranslations("reports")
  return (
    <>
      <AccountingTabPanel view="vat">
        <VatReturnTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="tds">
        <TdsReportTab dateRange={ctx.dateRange} branchFilterId={ctx.branchFilterId} />
      </AccountingTabPanel>
      <AccountingTabPanel view="ird">
        {/* Kept from the old standalone IRD page, which now redirects here. */}
        <div className="mb-3 flex justify-end">
          <Link
            href="/dashboard/reports/ird/materialized-view"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            {t("accounting.irdMaterializedView")}
          </Link>
        </div>
        <IrdReportsPanel embedded />
      </AccountingTabPanel>
    </>
  )
}
