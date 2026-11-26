"use client"

import { TabsContent } from "@/components/ui/tabs"
import { PageTabs } from "@/components/ui/page-tabs"
import { PayrollEmployees } from "@/features/payroll/components/payroll-employees"
import { PayrollReports } from "@/features/payroll/components/payroll-reports"
import { PayrollRuns } from "@/features/payroll/components/payroll-runs"
import { PayrollSettingsPanel } from "@/features/payroll/components/payroll-settings"

/** Payroll tabs. Edits, approvals and posting are gated by the API (Payroll.Manage / Approve / Post); a 403 shows as a toast. */
export function PayrollWorkspace() {
  return (
    <PageTabs
      label="Payroll sections"
      param="tab"
      defaultValue="runs"
      items={[
        { value: "runs", label: "Pay runs" },
        { value: "employees", label: "Employees" },
        { value: "reports", label: "SSF & TDS" },
        { value: "settings", label: "Settings" },
      ]}
    >
      <TabsContent value="runs">
        <PayrollRuns />
      </TabsContent>
      <TabsContent value="employees">
        <PayrollEmployees />
      </TabsContent>
      <TabsContent value="reports">
        <PayrollReports />
      </TabsContent>
      <TabsContent value="settings">
        <PayrollSettingsPanel />
      </TabsContent>
    </PageTabs>
  )
}
