"use client"

/**
 * Merged "Returns & refunds" page body (/dashboard/returns).
 *
 * - `?view=returns|refunds` picks the tab (default: returns); synced with
 *   router.replace so other params (`tab=supplier`, …) are preserved.
 * - `?action=create` opens the active tab's create modal, then is stripped.
 * - Tab count badges read the stats each panel already fetched (cache only —
 *   no extra requests), so a tab's badge appears once its stats are loaded.
 */

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus, RefreshCw, RotateCcw, Truck } from "lucide-react"
import { PageContainer, PageHeader } from "@/components/layouts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReturnsPanel } from "@/features/returns/components/returns-panel"
import { RefundsPanel } from "@/features/refunds/components/refunds-panel"
import { useReturnsStats } from "@/features/returns/hooks/use-returns"
import { useRefundsStats } from "@/features/refunds/hooks/use-refunds"
import { BranchFilterSelect, useBranchFilter } from "@/features/branches/components/branch-filter"
import {
  buildReturnsHref,
  parseReturnsSubTab,
  parseReturnsView,
  type ReturnsSubTab,
  type ReturnsView,
} from "@/features/returns/lib/returns-view"

function TabCount({ count, label }: { count: number | undefined; label: string }) {
  if (count === undefined) return null
  return (
    <Badge variant="muted" className="num ml-0.5 h-5 min-w-5 px-1.5 tabular-nums" aria-label={label}>
      {count}
    </Badge>
  )
}

export function ReturnsRefundsView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlView = parseReturnsView(searchParams.get("view"))
  const urlSubTab = parseReturnsSubTab(searchParams.get("tab"))

  // Local mirrors so tab switches feel instant; re-synced whenever the URL changes
  // (back/forward, sidebar links) using the "adjust state during render" pattern.
  const [view, setView] = useState<ReturnsView>(urlView)
  const [prevUrlView, setPrevUrlView] = useState<ReturnsView>(urlView)
  if (urlView !== prevUrlView) {
    setPrevUrlView(urlView)
    setView(urlView)
  }
  const [subTab, setSubTab] = useState<ReturnsSubTab>(urlSubTab)
  const [prevUrlSubTab, setPrevUrlSubTab] = useState<ReturnsSubTab>(urlSubTab)
  if (urlSubTab !== prevUrlSubTab) {
    setPrevUrlSubTab(urlSubTab)
    setSubTab(urlSubTab)
  }

  const [isReady, setIsReady] = useState(false)
  const [isReturnCreateOpen, setIsReturnCreateOpen] = useState(false)
  const [isRefundCreateOpen, setIsRefundCreateOpen] = useState(false)

  // One branch scope for both tabs (ViewAll users pick; others are pinned to their branch).
  const branchFilter = useBranchFilter()
  const branchId = branchFilter.branchId

  // Cache-only observers for the tab badges (the panels do the fetching).
  const { data: returnsStats } = useReturnsStats({ enabled: false, branchId })
  const { data: refundsStats } = useRefundsStats({ enabled: false, branchId })
  const returnsCount = returnsStats?.data?.[0]?.total
  const refundsCount = refundsStats?.data?.[0]?.total

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/dotnet/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setIsReady(true)
    }
    void checkUser()
  }, [])

  // ?action=create deep link → open the active tab's create flow, then drop the param.
  useEffect(() => {
    if (searchParams.get("action") !== "create") return
    if (parseReturnsView(searchParams.get("view")) === "refunds") setIsRefundCreateOpen(true)
    else setIsReturnCreateOpen(true)
    router.replace(buildReturnsHref(searchParams, { action: null }, pathname), { scroll: false })
  }, [searchParams, router, pathname])

  const changeView = (next: ReturnsView) => {
    if (next === view) return
    setView(next)
    router.replace(buildReturnsHref(searchParams, { view: next }, pathname), { scroll: false })
  }

  const changeSubTab = (next: ReturnsSubTab) => {
    setSubTab(next)
    if (next === urlSubTab) return
    router.replace(buildReturnsHref(searchParams, { tab: next === "supplier" ? "supplier" : null }, pathname), {
      scroll: false,
    })
  }

  const headerAction =
    view === "refunds" ? (
      <Button onClick={() => setIsRefundCreateOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        New refund
      </Button>
    ) : subTab === "supplier" ? (
      <Button onClick={() => setIsReturnCreateOpen(true)}>
        <Truck className="h-4 w-4" aria-hidden />
        New supplier return
      </Button>
    ) : (
      <Button onClick={() => setIsReturnCreateOpen(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        New customer return
      </Button>
    )

  return (
    <PageContainer>
      <PageHeader
        title="Returns & refunds"
        icon={RotateCcw}
        description={
          <>
            <strong className="font-medium text-foreground">Returns</strong> track stock coming back — customer returns
            against a sale and goods you send back to a supplier.{" "}
            <strong className="font-medium text-foreground">Refunds</strong> track money going back to a customer for a
            paid sale.
          </>
        }
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <BranchFilterSelect filter={branchFilter} id="returns-branch" hideLabel />
            {headerAction}
          </div>
        }
      />

      <Tabs value={view} onValueChange={(v) => changeView(parseReturnsView(v))} className="gap-0">
        <TabsList className="mb-6 w-full sm:w-fit" aria-label="Returns or refunds">
          <TabsTrigger value="returns" className="sm:px-4">
            <RotateCcw aria-hidden />
            Returns
            <TabCount
              count={returnsCount}
              label={`${returnsCount ?? 0} customer ${returnsCount === 1 ? "return" : "returns"}`}
            />
          </TabsTrigger>
          <TabsTrigger value="refunds" className="sm:px-4">
            <RefreshCw aria-hidden />
            Refunds
            <TabCount count={refundsCount} label={`${refundsCount ?? 0} ${refundsCount === 1 ? "refund" : "refunds"}`} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="returns">
          <ReturnsPanel
            isReady={isReady}
            subTab={subTab}
            onSubTabChange={changeSubTab}
            isCreateOpen={isReturnCreateOpen}
            onCreateOpenChange={setIsReturnCreateOpen}
            branchId={branchId}
          />
        </TabsContent>
        <TabsContent value="refunds">
          <RefundsPanel
            isReady={isReady}
            isCreateOpen={isRefundCreateOpen}
            onCreateOpenChange={setIsRefundCreateOpen}
            branchId={branchId}
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}
