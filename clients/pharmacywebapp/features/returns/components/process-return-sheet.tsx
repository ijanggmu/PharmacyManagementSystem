"use client"

import { RotateCcw } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import ProcessReturnForm from "@/features/returns/components/process-return-form"
import { useSale } from "@/features/sales/hooks/use-sales"
import { returnBlockedReason } from "@/features/sales/lib/sale-detail"

interface ProcessReturnSheetProps {
  /** The sale to return against; null keeps the panel closed. */
  saleId: string | null
  /** Sale line to start with selected, e.g. when started from that line's Return button. */
  initialSaleItemId?: string | null
  onClose: () => void
  /** Called once the return is saved (after the panel closes). */
  onSuccess?: () => void
}

/**
 * Process return in the right-side panel, over the list it was started from (Sales history, the sale's details,
 * or the Returns tab after finding the sale). A side panel rather than a dialog: the form has a line table, two
 * reasons and a settlement preview, so it needs the full height, and the list stays in view behind it.
 * Clicking outside doesn't close it (SheetContent ignores outside presses), so a half-filled return isn't lost.
 */
export function ProcessReturnSheet({ saleId, initialSaleItemId, onClose, onSuccess }: ProcessReturnSheetProps) {
  const open = !!saleId
  // Always the fresh detail read: it carries what earlier returns and refunds already took from each line.
  const saleQuery = useSale(saleId ?? "")
  const sale = saleQuery.data?.data?.[0] ?? null
  const loadError = saleQuery.error ?? saleQuery.data?.error
  const blocked = sale ? returnBlockedReason(sale) : null

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl lg:max-w-3xl">
        <SheetHeader className="gap-1 border-b px-5 pb-4 pt-5 pr-12">
          <SheetTitle className="flex items-center gap-2 text-lg tracking-tight">
            <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden />
            Process return
            {sale && <span className="num font-mono text-muted-foreground">· {sale.sale_number}</span>}
          </SheetTitle>
          <SheetDescription>
            Pick the lines coming back. Sealed packs go back into stock; the money is paid back on a credit note when
            you save.
          </SheetDescription>
        </SheetHeader>

        {saleQuery.isLoading ? (
          <div className="space-y-4 px-5 py-4" role="status" aria-label="Loading sale">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : loadError || !sale ? (
          <div className="px-5 py-4">
            <ErrorState
              size="compact"
              title="We couldn't load this sale"
              message={typeof loadError === "string" ? loadError : loadError?.message || "The sale wasn't found."}
              onRetry={() => void saleQuery.refetch()}
              retrying={saleQuery.isFetching}
            />
          </div>
        ) : blocked ? (
          <div className="px-5 py-4">
            <EmptyState size="compact" icon={RotateCcw} title="Nothing left to return" description={blocked} />
          </div>
        ) : (
          <ProcessReturnForm
            key={`${sale.id}:${initialSaleItemId ?? ""}`}
            sale={sale}
            initialSaleItemId={initialSaleItemId}
            layout="sheet"
            onCancel={onClose}
            onSuccess={() => {
              onClose()
              onSuccess?.()
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
