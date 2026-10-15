"use client"

/**
 * Step 1 of a customer return or refund started outside Sales: find the sale by invoice number,
 * customer name or phone (server search, newest first), then hand the full sale to the caller.
 * Walk-in sales are included.
 */

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Loader2, Receipt, Search, User, UserX } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CurrencyDisplay } from "@/components/currency-display"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useDebounce } from "@/lib/utils/performance"
import { salesApi, type Sale } from "@/features/sales/api-client"
import { isFullyReversed } from "@/features/sales/lib/sale-detail"

interface FindSaleDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (sale: Sale) => void
  title: string
  description: string
  branchId?: string
  /** Refunds give money back, so only paid sales qualify. */
  onlyPaid?: boolean
}

function customerName(sale: Sale): string | null {
  return sale.customers ? `${sale.customers.first_name} ${sale.customers.last_name}`.trim() : null
}

export function FindSaleDialog({ isOpen, onClose, onSelect, title, description, branchId, onlyPaid = false }: FindSaleDialogProps) {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [openingId, setOpeningId] = useState<string | null>(null)
  const term = useDebounce(search.trim(), 300)

  const salesQuery = useQuery({
    queryKey: ["find-sale", term, branchId ?? "", onlyPaid],
    queryFn: async () => {
      const res = await salesApi.getSales({
        search: term || undefined,
        branchId,
        paymentStatuses: onlyPaid ? ["paid", "completed"] : undefined,
        limit: 15,
        sortBy: "sale_date",
        sortOrder: "desc",
      })
      if (res.error) throw new Error(res.error)
      return (res.data ?? []).filter((s) => s.status !== "cancelled")
    },
    enabled: isOpen,
    staleTime: 15_000,
  })
  const sales = salesQuery.data ?? []

  const choose = async (sale: Sale) => {
    setOpeningId(sale.id)
    try {
      // The list row may be a summary; returns need every line.
      const res = await salesApi.getSale(sale.id)
      const full = res.data?.[0]
      if (!full) throw new Error(res.error ?? "The sale could not be loaded.")
      onSelect(full)
      setSearch("")
    } catch (error) {
      toast({
        title: "Couldn't open the sale",
        description: error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="border-b px-5 py-3">
          <label htmlFor="find-sale-search" className="sr-only">
            Search sales
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="find-sale-search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Invoice number, customer name or phone…"
              className="h-11 pl-9"
              autoComplete="off"
            />
            {salesQuery.isFetching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {term ? "Matching sales, newest first." : "Most recent sales. Type to search older ones."}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-live="polite">
          {salesQuery.isLoading ? (
            <div className="space-y-2 p-2" role="status" aria-label="Loading sales">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : salesQuery.isError ? (
            <p role="alert" className="p-6 text-center text-sm text-destructive">
              {salesQuery.error instanceof Error ? salesQuery.error.message : "Couldn't load sales."}
            </p>
          ) : sales.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {term ? `No ${onlyPaid ? "paid " : ""}sales match “${term}”.` : "No sales yet."}
            </p>
          ) : (
            <ul className="space-y-1">
              {sales.map((sale) => {
                const name = customerName(sale)
                const busy = openingId === sale.id
                // Listed (so the search isn't confusing) but not pickable: nothing is left on it to return.
                const usedUp = isFullyReversed(sale)
                return (
                  <li key={sale.id}>
                    <button
                      type="button"
                      onClick={() => void choose(sale)}
                      disabled={openingId !== null || usedUp}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                        "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60",
                        usedUp && "disabled:cursor-not-allowed hover:bg-transparent",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          name ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {name ? <User className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="num truncate font-mono text-sm font-medium">{sale.invoice_number || sale.sale_number}</span>
                          {usedUp ? (
                            <Badge variant="muted">Fully returned</Badge>
                          ) : sale.payment_status !== "paid" && sale.payment_status !== "completed" && (
                            <Badge variant="warning">
                              {sale.payment_status === "pending" ? "On account" : sale.payment_status}
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {name ?? "Walk-in customer"} · {new Date(sale.sale_date).toLocaleDateString()} ·{" "}
                          {medicineCountLabel(sale.sale_items ?? [])}
                        </span>
                      </span>
                      <span className="num shrink-0 text-sm font-semibold">
                        <CurrencyDisplay amount={sale.total_amount} />
                      </span>
                      {busy ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "2 medicines": a medicine drawn from two lots is two sale lines but one medicine to the customer. */
function medicineCountLabel(items: ReadonlyArray<{ medicine_id: string }>): string {
  const count = new Set(items.map((item) => item.medicine_id)).size
  return `${count} ${count === 1 ? "medicine" : "medicines"}`
}
