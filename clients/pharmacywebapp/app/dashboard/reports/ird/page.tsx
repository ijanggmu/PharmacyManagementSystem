"use client"

import Link from "next/link"
import { FileSpreadsheet } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { IrdReportsPanel } from "@/features/accounting/components/ird-reports-panel"

/** Standalone IRD reports — also shown as the IRD tab of Accounting › Tax & IRD. */
export default function IrdReportsPage() {
  return (
    <DashboardLayout>
      <div className="mb-3 flex justify-end">
        <Link
          href="/dashboard/reports/ird/materialized-view"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          IRD materialized view
        </Link>
      </div>
      <IrdReportsPanel />
    </DashboardLayout>
  )
}
