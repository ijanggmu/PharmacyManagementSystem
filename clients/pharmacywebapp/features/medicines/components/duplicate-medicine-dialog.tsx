"use client"

import { useEffect, useState } from "react"
import { Boxes, Loader2, PackagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DuplicateMedicine } from "@/features/medicines/api-client"

interface DuplicateMedicineDialogProps {
  open: boolean
  duplicates: DuplicateMedicine[]
  /** The form carries opening stock, so it can go onto the existing medicine as a new batch. */
  hasStock: boolean
  /** e.g. "50 units, batch PCM2411, expires 2028-01-31". */
  stockSummary: string
  busy: boolean
  onAddToExisting: (medicine: DuplicateMedicine) => void
  onUseExisting: (medicine: DuplicateMedicine) => void
  onCreateAnyway: () => void
  onCancel: () => void
}

function describe(m: DuplicateMedicine): string {
  return [m.name, m.strength, m.form].filter(Boolean).join(" · ")
}

/**
 * Shown when the medicine being created already exists (same name + strength + form). The usual
 * answer is a new batch of the existing medicine; "create anyway" is for a genuinely different
 * product (another manufacturer or brand) that happens to share the name.
 */
export function DuplicateMedicineDialog({
  open,
  duplicates,
  hasStock,
  stockSummary,
  busy,
  onAddToExisting,
  onUseExisting,
  onCreateAnyway,
  onCancel,
}: DuplicateMedicineDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (open) setSelectedId(duplicates[0]?.id ?? null)
  }, [open, duplicates])

  const selected = duplicates.find((d) => d.id === selectedId) ?? duplicates[0]

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>This medicine already exists</DialogTitle>
          <DialogDescription>
            {hasStock
              ? "Add the new stock as another batch of the existing medicine, so its stock, prices and reports stay in one place."
              : "Use the existing medicine instead of creating a second copy of it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label="Existing medicines">
          {duplicates.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={selected?.id === d.id}
              onClick={() => setSelectedId(d.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                selected?.id === d.id ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{describe(d)}</span>
                {(d.brandName || d.genericName || d.barcode) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[d.brandName, d.genericName, d.barcode && `Barcode ${d.barcode}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Boxes className="size-3.5" />
                {d.stockOnHand} in stock
              </span>
            </button>
          ))}
        </div>

        {hasStock && <p className="text-sm text-muted-foreground">New stock: {stockSummary}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={onCreateAnyway} disabled={busy}>
            It&apos;s a different product, create anyway
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Back to form
            </Button>
            {hasStock ? (
              <Button type="button" onClick={() => selected && onAddToExisting(selected)} disabled={busy || !selected}>
                {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <PackagePlus className="mr-1 size-4" />}
                Add as new batch
              </Button>
            ) : (
              <Button type="button" onClick={() => selected && onUseExisting(selected)} disabled={busy || !selected}>
                Use existing medicine
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
