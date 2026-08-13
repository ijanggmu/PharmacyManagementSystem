"use client"

/**
 * Turns the Settings → "Auto Reorder" toggle into something that actually does
 * something: when enabled, surfaces low/out-of-stock medicines here, grouped by
 * supplier, with a one-click "Create PO" that pre-fills a draft purchase order —
 * still reviewed and submitted by a human, not sent to a supplier unattended.
 * (See audit: "Auto Reorder" toggle previously had zero backend wiring.)
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw } from "lucide-react"
import { medicinesApi, type Medicine } from "@/features/medicines/api-client"
import { settingsApi } from "@/features/settings/api-client"
import CreatePurchaseOrderModal from "@/features/purchases/components/create-purchase-order-modal"

interface SupplierGroup {
  supplierId: string
  supplierName: string
  items: { medicine_id: string; quantity_ordered: number; unit_cost: string; name: string }[]
}

export default function ReorderSuggestions({ onCreated }: { onCreated: () => void }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<SupplierGroup[]>([])
  const [poModal, setPoModal] = useState<SupplierGroup | null>(null)

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

    const { data } = await medicinesApi.getMedicines({ stockStatuses: ["low", "out"], limit: 200 })
    const bySupplier = new Map<string, SupplierGroup>()
    for (const m of (data || []) as Medicine[]) {
      if (!m.supplier_id) continue
      const suggested = Math.max(1, (m.maximum_stock ?? 0) - (m.stock_quantity ?? 0))
      const group = bySupplier.get(m.supplier_id) || {
        supplierId: m.supplier_id,
        supplierName: m.suppliers?.name || "Supplier",
        items: [],
      }
      group.items.push({
        medicine_id: m.id,
        quantity_ordered: suggested,
        unit_cost: String(m.cost_price),
        name: m.name,
      })
      bySupplier.set(m.supplier_id, group)
    }
    setGroups([...bySupplier.values()])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loading && (!enabled || groups.length === 0)) return null

  return (
    <>
      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" />
            Reorder Suggestions
          </CardTitle>
          <CardDescription>
            Auto Reorder is on — these medicines are at or below minimum stock. Review and create a draft PO per
            supplier; nothing is sent automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Checking stock levels…</p>
          ) : (
            groups.map((group) => (
              <div key={group.supplierId} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{group.supplierName}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.items.length} medicine{group.items.length > 1 ? "s" : ""}:{" "}
                    {group.items.slice(0, 3).map((i) => i.name).join(", ")}
                    {group.items.length > 3 ? "…" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{group.items.length} low</Badge>
                  <Button size="sm" onClick={() => setPoModal(group)}>
                    Create PO
                  </Button>
                </div>
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
