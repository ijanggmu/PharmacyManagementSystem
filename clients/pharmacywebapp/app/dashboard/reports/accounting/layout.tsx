"use client"

import { Suspense } from "react"
import {
  BookMarked,
  BookOpen,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Link2,
  ListOrdered,
  Lock,
  NotebookPen,
  PlusCircle,
  Receipt,
  Scale,
  ScrollText,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageHeader } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePresetFilter } from "@/features/accounting/components/date-preset-filter"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import { AccountingProvider, useAccountingContext } from "./accounting-context"
import { AccountingViewProvider, useAccountingView } from "./accounting-view"
import { NewJournalDialogProvider, useNewJournalDialog } from "./new-journal-dialog"

/** Header icon per page (keyed like ACCOUNTING_PAGES) and tab icon per view id. */
const PAGE_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  register: ListOrdered,
  cash: Wallet,
  receivables: HandCoins,
  statements: FileSpreadsheet,
  vat: Receipt,
  "chart-of-accounts": BookOpen,
}

const VIEW_ICONS: Record<string, LucideIcon> = {
  register: ListOrdered,
  ledger: BookMarked,
  journal: NotebookPen,
  cash: Wallet,
  "bank-reconciliation": Landmark,
  cheques: ScrollText,
  receivables: HandCoins,
  payables: Truck,
  "profit-loss": TrendingUp,
  "balance-sheet": Scale,
  "trial-balance": Scale,
  reconciliation: Link2,
  vat: Receipt,
  ird: FileText,
  accounts: BookOpen,
  "payment-accounts": Wallet,
  "opening-balances": Landmark,
}

function AccountingChrome({ children }: { children: React.ReactNode }) {
  const {
    dateRange,
    setDateRange,
    branches,
    branchFilterId,
    setBranchFilterId,
    branchLocked,
    ownBranch,
    branchAccessReady,
    lockDate,
  } = useAccountingContext()
  const { active, pending, setView } = useAccountingView()
  const view = active?.view
  const newJournal = useNewJournalDialog()
  const showTabs = !!active && active.views.length > 1

  // Always the same Tabs root, so a tab appearing once permissions load doesn't remount the page body.
  return (
    <Tabs value={active?.view.id ?? ""} onValueChange={setView} className="min-w-0 gap-0">
      <div className="min-w-0 space-y-5">
        <PageHeader
          title={active?.page.title ?? "Accounting"}
          description={active?.page.description ?? "General ledger, trial balance, voucher register, and manual journals (double-entry)."}
          icon={(active && PAGE_ICONS[active.page.key]) ?? BookOpen}
          badge={
            lockDate ? (
              <Badge variant="muted" title="Vouchers cannot be dated on or before this day">
                <Lock aria-hidden />
                Locked to <span className="num">{lockDate}</span>
              </Badge>
            ) : undefined
          }
          actions={
            view?.newJournalAction && newJournal.canWrite ? (
              <Button onClick={newJournal.open}>
                <PlusCircle aria-hidden />
                New journal
              </Button>
            ) : undefined
          }
          className="mb-0 sm:mb-0"
        />

        {showTabs && active && (
          <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            <TabsList aria-label={`${active.page.title} views`} className="w-max min-w-full justify-start sm:min-w-0">
              {active.views.map((v) => {
                const Icon = VIEW_ICONS[v.id] ?? BookOpen
                return (
                  <TabsTrigger key={v.id} value={v.id} className="flex-none px-3">
                    <Icon aria-hidden />
                    {v.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>
        )}

        {!pending && (view?.usesFilters ?? true) && (
          <div
            role="group"
            aria-label="Report filters"
            className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-8"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Period
                {view?.asOf ? (
                  <span className="ml-1 font-normal">· balances are as of the period end</span>
                ) : null}
              </span>
              <DatePresetFilter value={dateRange} onChange={setDateRange} />
            </div>
            {branchAccessReady && branches.length > 0 && branchLocked && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <span id="accounting-branch-label" className="text-xs font-medium text-muted-foreground">
                  Branch
                </span>
                <BranchScopeBadge branch={ownBranch} className="w-full sm:w-[220px]" />
              </div>
            )}
            {branchAccessReady && branches.length > 0 && !branchLocked && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="accounting-branch-filter" className="text-xs font-medium text-muted-foreground">
                  Branch
                </Label>
                <Select value={branchFilterId || "all"} onValueChange={(v) => setBranchFilterId(v === "all" ? "" : v)}>
                  <SelectTrigger id="accounting-branch-filter" className="w-full sm:w-[220px]">
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
              </div>
            )}
          </div>
        )}

        {children}
      </div>
    </Tabs>
  )
}

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <AccountingProvider>
        <NewJournalDialogProvider>
          {/* useSearchParams (the ?view= tab) needs a Suspense boundary for prerendering. */}
          <Suspense fallback={<div className="min-h-[50vh]" aria-busy="true" />}>
            <AccountingViewProvider>
              <AccountingChrome>{children}</AccountingChrome>
            </AccountingViewProvider>
          </Suspense>
        </NewJournalDialogProvider>
      </AccountingProvider>
    </DashboardLayout>
  )
}
