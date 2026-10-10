"use client"

import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { SIDE_LABEL, formatNepaliAmount, type OpeningDiffRow } from "@/features/accounting/lib/opening-balances"

function Side({ value, symbol }: { value: OpeningDiffRow["before"]; symbol: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span className="num whitespace-nowrap tabular-nums">
      {symbol} {formatNepaliAmount(value.amount)} <span className="text-xs text-muted-foreground">{SIDE_LABEL[value.side].short}</span>
    </span>
  )
}

const KIND = {
  added: { label: "Added", variant: "success" },
  removed: { label: "Removed", variant: "danger" },
  changed: { label: "Changed", variant: "info" },
} as const

/** Per-account before → after list, used on the Edit review and in history entries. */
export function OpeningDiffList({ rows, symbol }: { rows: OpeningDiffRow[]; symbol: string }) {
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {rows.map((r) => (
        <li key={r.accountId} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant={KIND[r.kind].variant}>{KIND[r.kind].label}</Badge>
            <span className="num shrink-0 text-xs text-muted-foreground">{r.accountCode}</span>
            <span className="truncate">{r.accountName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Side value={r.before} symbol={symbol} />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="to" />
            <span className="font-medium">
              <Side value={r.after} symbol={symbol} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
