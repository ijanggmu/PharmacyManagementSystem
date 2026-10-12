"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Gift, Loader2, PencilLine, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { CurrencyDisplay } from "@/components/currency-display"
import { customersApi } from "@/features/customers/api-client"
import type { DotnetCustomerLoyalty } from "@/lib/api/customers-api"
import { useLoyaltySettings } from "@/features/customers/hooks/use-loyalty-settings"

interface CustomerLoyaltyPanelProps {
  customerId: string
  /** Called after points change, so the owner can refresh the customer row. */
  onChanged?: () => void
}

const TYPE_LABEL: Record<string, string> = {
  Earn: "Earned",
  Redeem: "Redeemed",
  Adjust: "Adjusted",
  EarnReversed: "Taken back",
  RedeemReturned: "Given back",
}

/** Loyalty on the customer profile: balance, what it's worth, recent movements, and a staff adjustment. */
export function CustomerLoyaltyPanel({ customerId, onChanged }: CustomerLoyaltyPanelProps) {
  const { toast } = useToast()
  const { settings } = useLoyaltySettings()
  const [loyalty, setLoyalty] = useState<DotnetCustomerLoyalty | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [points, setPoints] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: loadError } = await customersApi.getLoyalty(customerId)
    setLoyalty(data)
    setError(loadError)
  }, [customerId])

  useEffect(() => {
    setLoyalty(null)
    setAdjusting(false)
    void load()
  }, [load])

  const submitAdjustment = async () => {
    const delta = Number.parseInt(points, 10)
    if (!Number.isInteger(delta) || delta === 0 || !reason.trim()) return
    setSaving(true)
    const { error: adjustError } = await customersApi.adjustLoyalty(customerId, delta, reason.trim())
    setSaving(false)
    if (adjustError) {
      toast({ title: "Couldn't adjust points", description: adjustError, variant: "destructive" })
      return
    }
    toast({ title: delta > 0 ? `${delta} points added` : `${-delta} points removed` })
    setPoints("")
    setReason("")
    setAdjusting(false)
    await load()
    onChanged?.()
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!loyalty) return <Skeleton className="h-28 w-full rounded-xl" />

  const delta = Number.parseInt(points, 10)
  const canSubmit = Number.isInteger(delta) && delta !== 0 && reason.trim().length > 0 && !saving

  return (
    <section aria-labelledby="loyalty-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="loyalty-heading" className="flex items-center gap-2 font-semibold">
          <Gift className="size-4 text-primary" aria-hidden />
          Loyalty
        </h3>
        {loyalty.isMember ? (
          <Badge variant="success" className="gap-1">
            <Sparkles className="size-3" aria-hidden />
            Member
          </Badge>
        ) : (
          <Badge variant="outline">Not a member</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4 dark:from-amber-400/10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Points</p>
          <p className="num font-display text-3xl font-semibold leading-tight">{loyalty.points.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">
            Worth <CurrencyDisplay amount={loyalty.pointsValue} className="font-medium text-foreground" /> off a bill
          </p>
        </div>
        {!settings.enabled && <p className="max-w-[16rem] text-xs text-muted-foreground">The loyalty programme is off, so points aren&apos;t earned or redeemed right now.</p>}
        <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setAdjusting((v) => !v)} aria-expanded={adjusting}>
          <PencilLine className="mr-1.5 size-4" aria-hidden />
          Adjust
        </Button>
      </div>

      {adjusting && (
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="loyalty-adjust-points">Points</Label>
            <Input
              id="loyalty-adjust-points"
              type="number"
              step={1}
              inputMode="numeric"
              placeholder="+50 or −20"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="loyalty-adjust-reason">Reason</Label>
            <Input
              id="loyalty-adjust-reason"
              value={reason}
              maxLength={256}
              placeholder="e.g. Welcome bonus"
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button type="button" onClick={() => void submitAdjustment()} disabled={!canSubmit} className="min-h-10">
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
            Save
          </Button>
        </div>
      )}

      {loyalty.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No points earned or spent yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {loyalty.entries.slice(0, 8).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {entry.points >= 0 ? (
                  <ArrowUpRight className="size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-4 shrink-0 text-destructive" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{entry.description ?? TYPE_LABEL[entry.entryType] ?? entry.entryType}</span>
                  <span className="block text-xs text-muted-foreground">
                    {TYPE_LABEL[entry.entryType] ?? entry.entryType} · {new Date(entry.createdAtUtc).toLocaleDateString()}
                  </span>
                </span>
              </span>
              <span className={cn("num shrink-0 font-semibold", entry.points >= 0 ? "text-success" : "text-destructive")}>
                {entry.points > 0 ? "+" : ""}
                {entry.points}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
