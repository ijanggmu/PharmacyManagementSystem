"use client"

/**
 * Turns the Settings → "Auto Reorder" toggle into something that actually does
 * something: when enabled, surfaces reorder candidates here, grouped by supplier,
 * with a one-click "Create PO" that pre-fills a draft purchase order — still
 * reviewed and submitted by a human, not sent to a supplier unattended.
 * (See audit: "Auto Reorder" toggle previously had zero backend wiring.)
 *
 * Suggestions combine two signals (see getReorderSuggestions, purchase-service.ts):
 * the static min/max stock threshold, and actual sales velocity over the last 30
 * days — so a fast-moving medicine still above its minimum but on track to run out
 * before a new order could arrive also surfaces here, not just already-low stock.
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FilePlus2, RefreshCw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { purchasesApi, type ReorderSuggestionGroup } from "@/features/purchases/api-client"
import { settingsApi } from "@/features/settings/api-client"
import CreatePurchaseOrderModal from "@/features/purchases/components/create-purchase-order-modal"

const REASON_LABEL: Record<string, string> = {
  out_of_stock: "Out of stock",
  below_minimum: "Below minimum",
  will_stock_out_before_resupply: "Selling faster than it can be restocked",
}

const REASON_TONE: Record<string, "danger" | "warning" | "info"> = {
  out_of_stock: "danger",
  below_minimum: "warning",
  will_stock_out_before_resupply: "info",
}

export default function ReorderSuggestions({ onCreated }: { onCreated: () => void }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<ReorderSuggestionGroup[]>([])
  const [poModal, setPoModal] = useState<ReorderSuggestionGroup | null>(null)

  const load = async () => {
    setLoading(true)
    const { value } = await settingsApi.getByKey("auto_reorder_enabled")
    const isEnabled = value === "true"
    setEnabled(isEnabled)

    if (!isEnabled) {
      setGroups([])
      setLoading(false)
      return
    }

    const { data } = await purchasesApi.getReorderSuggestions()
    setGroups(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loading && (!enabled || groups.length === 0)) return null

  return (
    <>
      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-warning" aria-hidden />
            Reorder suggestions
          </CardTitle>
          <CardDescription>
            Auto Reorder is on — these medicines are below minimum stock, out of stock, or selling fast enough to run
            out before a new order could arrive. Review and create a draft PO per supplier; nothing is sent
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2" aria-busy aria-label="Checking stock levels and sales velocity">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.supplierId} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-sm" title={group.supplierName}>
                    {group.supplierName}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">
                      <span className="num">{group.items.length}</span> to reorder
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setPoModal(group)}>
                      <FilePlus2 aria-hidden />
                      Create PO
                    </Button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li
                      key={item.medicine_id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{item.name}</span> —{" "}
                        <span className="num">{item.current_stock}</span> in stock
                        {item.avg_daily_sales > 0 ? `, ~${item.avg_daily_sales}/day` : ""}
                        {item.days_of_stock_left !== null ? `, ${item.days_of_stock_left}d left` : ""}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <Badge variant={REASON_TONE[item.reason] ?? "muted"}>
                          {REASON_LABEL[item.reason] || item.reason}
                        </Badge>
                        <span>
                          Order <span className="num font-medium text-foreground">{item.quantity_ordered}</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <CreatePurchaseOrderModal
        isOpen={!!poModal}
        onClose={() => setPoModal(null)}
        onCreated={() => {
          setPoModal(null)
          onCreated()
          load()
        }}
        initialSupplierId={poModal?.supplierId}
        initialLines={poModal?.items.map(({ medicine_id, quantity_ordered, unit_cost }) => ({
          medicine_id,
          quantity_ordered,
          unit_cost,
        }))}
      />
    </>
  )
}
