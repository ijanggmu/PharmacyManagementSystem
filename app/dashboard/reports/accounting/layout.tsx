"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { DateRangePicker } from "@/components/date-range-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AccountingProvider, useAccountingContext } from "./accounting-context"

function AccountingChrome({ children }: { children: React.ReactNode }) {
  const { dateRange, setDateRange, branches, branchFilterId, setBranchFilterId } = useAccountingContext()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
          <p className="text-muted-foreground">
            General ledger, trial balance, voucher register, and manual journals (double-entry).
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {branches.length > 0 && (
            <Select
              value={branchFilterId || "all"}
              onValueChange={(v) => setBranchFilterId(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>
      </div>

      {children}
    </div>
  )
}

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <AccountingProvider>
        <AccountingChrome>{children}</AccountingChrome>
      </AccountingProvider>
    </DashboardLayout>
  )
}
