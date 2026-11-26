"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import {
  ArrowLeftRight,
  Armchair,
  BadgePercent,
  BookMarked,
  Calculator,
  CalendarClock,
  CalendarRange,
  Percent,
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
  SlidersHorizontal,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageHeader } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { PageTabsBar, STICKY_BAR_CLASS } from "@/components/ui/page-tabs"
import { DatePresetFilter } from "@/features/accounting/components/date-preset-filter"
import { BranchScopeBadge } from "@/features/branches/components/branch-scope-badge"
import { AccountingProvider, useAccountingContext } from "./accounting-context"
import { AccountingViewProvider, useAccountingView } from "./accounting-view"
import { NewJournalDialogProvider, useNewJournalDialog } from "./new-journal-dialog"
import { useI18n, useTranslations } from "@/lib/i18n/i18n-provider"
import type { NamespaceTranslator } from "@/lib/i18n/translate"
import { reports as reportsEn } from "@/lib/i18n/messages/en/reports"

type AccountingPageKey = keyof typeof reportsEn.accounting.pages
type AccountingViewKey = keyof typeof reportsEn.accounting.views

const isPageKey = (key: string): key is AccountingPageKey => key in reportsEn.accounting.pages
const isViewKey = (key: string): key is AccountingViewKey => key in reportsEn.accounting.views

/** Translated page title / description, falling back to the English definition for an unknown key. */
function pageText(t: NamespaceTranslator<"reports">, key: string, field: "title" | "description", fallback: string): string {
  return isPageKey(key) ? t(`accounting.pages.${key}.${field}` as const) : fallback
}

function viewLabel(t: NamespaceTranslator<"reports">, id: string, fallback: string): string {
  return isViewKey(id) ? t(`accounting.views.${id}` as const) : fallback
}

/** Header icon per page (keyed like ACCOUNTING_PAGES) and tab icon per view id. */
const PAGE_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  register: ListOrdered,
  cash: Wallet,
  receivables: HandCoins,
  statements: FileSpreadsheet,
  vat: Receipt,
  "fixed-assets": Armchair,
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
  "payables-due": CalendarClock,
  "profit-loss": TrendingUp,
  "balance-sheet": Scale,
  "cash-flow": ArrowLeftRight,
  "trial-balance": Scale,
  reconciliation: Link2,
  vat: Receipt,
  tds: BadgePercent,
  ird: FileText,
  accounts: BookOpen,
  "payment-accounts": Wallet,
  "tds-rates": SlidersHorizontal,
  "opening-balances": Landmark,
  assets: Armchair,
  depreciation: Calculator,
  schedule: CalendarRange,
  "tax-pools": Percent,
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
  const t = useTranslations("reports")
  const { localizeDigits } = useI18n()
  const pageTitle = active ? pageText(t, active.page.key, "title", active.page.title) : t("accounting.chrome.defaultTitle")

  // Always the same Tabs root, so a tab appearing once permissions load doesn't remount the page body.
  return (
    <Tabs value={active?.view.id ?? ""} onValueChange={setView} className="min-w-0 gap-0">
      <div className="min-w-0 space-y-4">
        <PageHeader
          title={pageTitle}
          description={
            active
              ? pageText(t, active.page.key, "description", active.page.description)
              : t("accounting.chrome.defaultDescription")
          }
          icon={(active && PAGE_ICONS[active.page.key]) ?? BookOpen}
          badge={
            lockDate ? (
              <Badge variant="muted" title={t("accounting.chrome.lockedTitle")}>
                <Lock aria-hidden />
                {t("accounting.chrome.lockedTo")} <span className="num">{localizeDigits(lockDate)}</span>
              </Badge>
            ) : undefined
          }
          actions={
            view?.newJournalAction && newJournal.canWrite ? (
              // An accountant's tool: available, but not the loudest thing on an owner's page.
              <Button variant="outline" onClick={newJournal.open}>
                <PlusCircle aria-hidden />
                {t("accounting.chrome.newJournal")}
              </Button>
            ) : undefined
          }
          className="mb-0 sm:mb-0"
        />

        {/* One sticky bar: the view tabs and the period/branch filters stay in reach while the page scrolls,
            on a single line when there's room. */}
        {(showTabs || (!pending && (view?.usesFilters ?? true))) && (
          <div className={cn(STICKY_BAR_CLASS, "flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between xl:gap-6")}>
            {showTabs && active && (
              <PageTabsBar
                label={t("accounting.chrome.views", { page: pageTitle })}
                value={active.view.id}
                items={active.views.map((v) => {
                  const Icon = VIEW_ICONS[v.id] ?? BookOpen
                  return { value: v.id, label: viewLabel(t, v.id, v.label), icon: <Icon aria-hidden /> }
                })}
              />
            )}
            {!pending && (view?.usesFilters ?? true) && (
              <div
              role="group"
              aria-label={t("accounting.chrome.filters")}
              className={cn(
                "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4",
                // Beside tabs the filters sit on the right; on a page without tabs they start at the left.
                showTabs && "xl:flex-1 xl:justify-end",
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {/* A view with its own period control (VAT return: one BS month) skips the shared one: one picker per page. */}
                {!view?.hidePeriod && <DatePresetFilter value={dateRange} onChange={setDateRange} />}
                {view?.asOf ? <span className="text-xs text-muted-foreground">{t("accounting.chrome.asOfNote")}</span> : null}
              </div>
              {branchAccessReady && branches.length > 0 && branchLocked && (
                <BranchScopeBadge branch={ownBranch} className="w-full sm:w-[190px]" />
              )}
              {branchAccessReady && branches.length > 0 && !branchLocked && (
                <Select value={branchFilterId || "all"} onValueChange={(v) => setBranchFilterId(v === "all" ? "" : v)}>
                  <SelectTrigger id="accounting-branch-filter" aria-label={t("accounting.chrome.branch")} className="w-full sm:w-[190px]">
                    <SelectValue placeholder={t("accounting.chrome.branch")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("accounting.chrome.allBranches")}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
