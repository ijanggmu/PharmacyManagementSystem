"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SkeletonText } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import {
  CASH_FLOW_ACTIVITIES,
  getCashFlowClassifications,
  updateCashFlowClassifications,
  type CashFlowActivity,
  type CashFlowClassification,
} from "@/lib/api/accounting-statements-api"
import { ACCOUNTING_ROOT_KEY } from "@/features/accounting/hooks/use-vouchers"

export const CASH_FLOW_ACTIVITY_LABEL: Record<CashFlowActivity | "Cash", string> = {
  Operating: "Operating",
  Investing: "Investing",
  Financing: "Financing",
  NonCash: "Non-cash",
  Cash: "Cash & bank",
}

const DEFAULT = "__default"
const CLASSIFICATIONS_KEY = [...ACCOUNTING_ROOT_KEY, "cash-flow-classifications"] as const

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
}

/**
 * Per-account cash flow classification. Each account follows its own tag, else its nearest tagged parent, else a
 * default from its head and name; cash and bank accounts (10xx) are the cash itself and are not listed.
 */
export function CashFlowClassificationDialog({ open, onOpenChange, canEdit }: Props) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  /** accountId → new tag (null = back to default); only changed rows. */
  const [draft, setDraft] = useState<Record<string, CashFlowActivity | null>>({})

  const list = useQuery({ queryKey: CLASSIFICATIONS_KEY, queryFn: getCashFlowClassifications, enabled: open, staleTime: 30_000 })
  const save = useMutation({
    mutationFn: (items: Array<{ accountId: string; activity: CashFlowActivity | null }>) => updateCashFlowClassifications(items),
    onSuccess: (rows) => {
      qc.setQueryData(CLASSIFICATIONS_KEY, rows)
      void qc.invalidateQueries({ queryKey: [...ACCOUNTING_ROOT_KEY, "cash-flow"] })
      setDraft({})
      toast({ title: "Cash flow classification saved" })
      onOpenChange(false)
    },
    onError: (e) => toast({ title: "Save failed", description: apiRequestErrorMessage(e), variant: "destructive" }),
  })

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (list.data ?? [])
      .filter((r) => r.effectiveActivity !== "Cash")
      .filter((r) => !term || r.accountCode.toLowerCase().includes(term) || r.accountName.toLowerCase().includes(term))
  }, [list.data, search])

  const changes = Object.entries(draft)
  const tagOf = (r: CashFlowClassification) => (r.accountId in draft ? draft[r.accountId] : r.tag)

  const onSelect = (r: CashFlowClassification, value: string) => {
    const next = value === DEFAULT ? null : (value as CashFlowActivity)
    setDraft((d) => {
      const copy = { ...d }
      if (next === r.tag) delete copy[r.accountId]
      else copy[r.accountId] = next
      return copy
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setDraft({})
        onOpenChange(o)
      }}
    >
      <DialogContent className={`${DIALOG_CONTENT_SCROLL_BODY_CLASS} sm:max-w-3xl`}>
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Cash flow classification</DialogTitle>
          <DialogDescription>
            Where each account&apos;s movement appears in the cash flow statement. A tag on a group applies to the accounts
            beneath it. Revenue or expense tagged investing or financing (e.g. interest) moves out of operating profit;
            non-cash expenses (depreciation) are added back.
          </DialogDescription>
        </DialogHeader>
        <DialogScrollBody>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or name"
              className="pl-8"
              aria-label="Search accounts"
            />
          </div>
          {list.isLoading ? (
            <SkeletonText lines={8} />
          ) : list.error ? (
            <p className="text-sm text-destructive">{apiRequestErrorMessage(list.error)}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {rows.map((r) => {
                const tag = tagOf(r)
                const changed = r.accountId in draft
                return (
                  <li key={r.accountId} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="num mr-2 font-mono text-xs text-muted-foreground">{r.accountCode}</span>
                      <span className={r.isPostable ? "" : "font-semibold"}>{r.accountName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{r.accountType}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {!changed && <Badge variant="muted">{CASH_FLOW_ACTIVITY_LABEL[r.effectiveActivity]}</Badge>}
                      <Select value={tag ?? DEFAULT} onValueChange={(v) => onSelect(r, v)} disabled={!canEdit || save.isPending}>
                        <SelectTrigger className="h-8 w-[190px]" aria-label={`Cash flow activity for ${r.accountCode} ${r.accountName}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT}>Default ({CASH_FLOW_ACTIVITY_LABEL[r.defaultActivity]})</SelectItem>
                          {CASH_FLOW_ACTIVITIES.map((a) => (
                            <SelectItem key={a} value={a}>
                              {CASH_FLOW_ACTIVITY_LABEL[a]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  </li>
                )
              })}
              {rows.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No accounts match.</li>}
            </ul>
          )}
        </DialogScrollBody>
        <DialogStickyFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button
              type="button"
              onClick={() => save.mutate(changes.map(([accountId, activity]) => ({ accountId, activity })))}
              disabled={changes.length === 0}
              loading={save.isPending}
              loadingText="Saving…"
            >
              Save {changes.length > 0 ? `(${changes.length})` : ""}
            </Button>
          )}
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}
