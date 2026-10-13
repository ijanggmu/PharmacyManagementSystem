"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PayrollEmployees } from "@/features/payroll/components/payroll-employees"
import { PayrollReports } from "@/features/payroll/components/payroll-reports"
import { PayrollRuns } from "@/features/payroll/components/payroll-runs"
import { PayrollSettingsPanel } from "@/features/payroll/components/payroll-settings"

/** Payroll tabs. Edits, approvals and posting are gated by the API (Payroll.Manage / Approve / Post); a 403 shows as a toast. */
export function PayrollWorkspace() {
  return (
    <Tabs defaultValue="runs" className="space-y-4">
      <TabsList>
        <TabsTrigger value="runs">Pay runs</TabsTrigger>
        <TabsTrigger value="employees">Employees</TabsTrigger>
        <TabsTrigger value="reports">SSF &amp; TDS</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
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
    </Tabs>
  )
}
