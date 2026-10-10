"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, History, PencilLine, PlusCircle, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FetchingIndicator, QueryState, SectionHeading } from "@/features/accounting/components/accounting-ui"
import type { OpeningBalanceAction, OpeningBalanceHistoryEntry } from "@/features/accounting/api-client-opening-balances"
import { useAccountingMoney } from "@/features/accounting/hooks/use-accounting-money"
import { OPENING_HISTORY_PAGE_SIZE, useOpeningBalanceHistory } from "@/features/accounting/hooks/use-opening-balances"
import { changesToDiff, formatNepaliAmount } from "@/features/accounting/lib/opening-balances"
import { cn } from "@/lib/utils"
import { OpeningDiffList } from "./opening-diff-list"

const ACTION = {
  Set: { label: "Set", variant: "success", icon: PlusCircle, dot: "bg-success" },
  Edit: { label: "Edited", variant: "info", icon: PencilLine, dot: "bg-info" },
  Reset: { label: "Reset", variant: "warning", icon: RotateCcw, dot: "bg-warning" },
} as const satisfies Record<OpeningBalanceAction, unknown>

function formatWhen(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** Timeline of every Set / Edit / Reset for the branch, newest first, with vouchers and per-account diffs. */
export function OpeningBalanceHistory({ branchId, onOpenVoucher }: { branchId: string; onOpenVoucher: (voucherId: string) => void }) {
  const [page, setPage] = useState(1)
  // Another branch has its own history: start from its newest page.
  useEffect(() => setPage(1), [branchId])
  const history = useOpeningBalanceHistory(branchId, page)
  const items = history.data?.items ?? []
  const totalPages = history.data?.totalPages ?? 1

  return (
    <Card>
      <CardHeader className="pb-3">
        <SectionHeading
          icon={History}
          title="History"
          description="Every time opening balances were set, edited or reset, with who did it and why."
          actions={<FetchingIndicator active={history.isFetching && !history.isLoading} />}
        />
      </CardHeader>
      <CardContent>
        <QueryState
          isLoading={history.isLoading}
          error={history.error}
          onRetry={() => void history.refetch()}
          retrying={history.isFetching}
          isEmpty={items.length === 0}
          empty={{ icon: History, title: "No changes yet", description: "Setting opening balances for this branch will appear here." }}
          skeleton={
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          }
          errorTitle="Couldn't load the history"
        >
          <ol className="relative space-y-1">
            {items.map((entry, i) => (
              <HistoryItem key={entry.id} entry={entry} last={i === items.length - 1} onOpenVoucher={onOpenVoucher} />
            ))}
          </ol>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
              <span className="num text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Newer changes">
                  <ChevronLeft aria-hidden />
                  Newer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages || items.length < OPENING_HISTORY_PAGE_SIZE}
                  aria-label="Older changes"
                >
                  Older
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}

function HistoryItem({
  entry,
  last,
  onOpenVoucher,
}: {
  entry: OpeningBalanceHistoryEntry
  last: boolean
  onOpenVoucher: (voucherId: string) => void
}) {
  const { symbol } = useAccountingMoney()
  const [open, setOpen] = useState(false)
  const meta = ACTION[entry.action] ?? ACTION.Set
  const Icon = meta.icon
  const diff = changesToDiff(entry.changes)
  const equity = entry.equityAdjustmentCredit || entry.equityAdjustmentDebit
  const diffId = `ob-diff-${entry.id}`

  return (
    <li className="relative pl-8">
      {!last && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-border" aria-hidden />}
      <span className={cn("absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full text-white", meta.dot)} aria-hidden>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="pb-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <span className="text-sm font-medium">{entry.performedByName}</span>
          <span className="text-xs text-muted-foreground">
            <time dateTime={entry.performedAtUtc}>{formatWhen(entry.performedAtUtc)}</time>
          </span>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          {entry.action === "Reset" ? (
            <>Opening balances dated <span className="num text-foreground">{entry.previousOpeningDate}</span> were reversed; none are active.</>
          ) : (
            <>
              Go-live <span className="num text-foreground">{entry.openingDate}</span>
              {entry.previousOpeningDate && entry.previousOpeningDate !== entry.openingDate && (
                <> (was <span className="num">{entry.previousOpeningDate}</span>)</>
              )}
              {" · "}Dr <span className="num text-foreground">{symbol} {formatNepaliAmount(entry.totalDebit)}</span>
              {" · "}Cr <span className="num text-foreground">{symbol} {formatNepaliAmount(entry.totalCredit)}</span>
              {equity > 0 && (
                <>
                  {" · "}Equity difference <span className="num text-foreground">{symbol} {formatNepaliAmount(equity)}</span>
                </>
              )}
            </>
          )}
        </p>

        {entry.reason && (
          <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic text-foreground">{entry.reason}</blockquote>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {entry.postedVoucherId && (
            <VoucherLink id={entry.postedVoucherId} no={entry.postedVoucherNo} label="Posted" onOpen={onOpenVoucher} />
          )}
          {entry.reversedVoucherId && (
            <VoucherLink id={entry.reversedVoucherId} no={entry.reversedVoucherNo} label="Reversed" onOpen={onOpenVoucher} />
          )}
          {entry.reversalVoucherId && (
            <VoucherLink id={entry.reversalVoucherId} no={entry.reversalVoucherNo} label="Reversal" onOpen={onOpenVoucher} />
          )}
          {diff.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-expanded={open}
              aria-controls={diffId}
              onClick={() => setOpen((o) => !o)}
            >
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
              {open ? "Hide" : "Show"} {diff.length} account change{diff.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>

        {open && (
          <div id={diffId} className="mt-2">
            <OpeningDiffList rows={diff} symbol={symbol} />
          </div>
        )}
      </div>
    </li>
  )
}

function VoucherLink({ id, no, label, onOpen }: { id: string; no: string | null; label: string; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-primary">{no ?? "voucher"}</span>
    </button>
  )
}
