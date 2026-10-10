"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { IrdReportsPanel } from "@/features/accounting/components/ird-reports-panel"

/** Standalone IRD reports — also shown as the IRD tab of Accounting › Tax & IRD. */
export default function IrdReportsPage() {
  return (
    <DashboardLayout>
      <IrdReportsPanel />
    </DashboardLayout>
  )
}
