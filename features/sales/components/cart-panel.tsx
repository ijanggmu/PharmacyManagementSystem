"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { CurrencyDisplay } from "@/components/currency-display"
import { Loader2, Percent, Receipt, Search, ShoppingCart, Trash2, X } from "lucide-react"
import { CartItem } from "@/features/sales/types"
import FefoPickNote from "./fefo-pick-note"

interface CartPanelProps {
  cart: CartItem[]
  filteredCartItems: CartItem[]
  cartSearchQuery: string
  setCartSearchQuery: (q: string) => void
  subtotal: number
  taxAmount: number
  taxRate: number
  discountAmount: number
  discountPercent: number
  setDiscountPercent: (p: number) => void
  total: number
  loading: boolean
  onRemove: (id: string) => void
  onUpdateQty: (id: string, qty: number) => void
  onUpdateDiscount: (id: string, discountPercent: number) => void
  onClear: () => void
  onSubmit: () => void
}

export default function CartPanel({
  cart,
  filteredCartItems,
  cartSearchQuery,
  setCartSearchQuery,
  subtotal,
  taxAmount,
  taxRate,
  discountAmount,
  discountPercent,
  setDiscountPercent,
  total,
  loading,
  onRemove,
  onUpdateQty,
  onUpdateDiscount,
  onClear,
  onSubmit,
}: CartPanelProps) {
  return (
    <div className="flex flex-col rounded-lg border bg-card p-4 min-h-[420px]">
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <h2 id="cart-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart className="h-5 w-5 text-primary" aria-hidden />
          Cart
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{cart.length} item{cart.length !== 1 ? "s" : ""}</Badge>
          {cart.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive hover:bg-destructive/10"
              onClick={onClear}
              aria-label="Clear all items from cart"
              title="Clear cart"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder="Search cart..."
              value={cartSearchQuery}
              onChange={(e) => setCartSearchQuery(e.target.value)}
              className="h-10 pl-9 text-sm"
              aria-label="Search cart items"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex-1 min-h-0 flex flex-col gap-4">
        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40" aria-hidden />
            <p className="mt-2 text-sm font-medium text-muted-foreground">Cart is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">Add products from the catalog</p>
          </div>
        ) : filteredCartItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">No items match your search</p>
          </div>
        ) : (
          <>
            {/* Card rows instead of a wide table — every field stays visible with no
                horizontal scroll, even in the narrow (~380-420px) cart sidebar. */}
            <div className="overflow-y-auto overflow-x-hidden border rounded-md max-h-[280px] min-h-0 divide-y">
              {filteredCartItems.map((item, index) => (
                <div key={item.medicineId} className="p-2.5 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground shrink-0">{index + 1}.</span>
                        <span className="font-medium text-sm truncate">{item.medicineName}</span>
                        <Badge
                          variant={item.isTaxable ? "outline" : "secondary"}
                          className="h-4 shrink-0 gap-0.5 px-1 text-[10px] font-normal"
                        >
                          <Percent className="h-2.5 w-2.5" aria-hidden />
                          {item.isTaxable ? "Tax" : "No tax"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.strength} · {item.form} · <CurrencyDisplay amount={item.unitPrice} />/unit
                      </div>
                      <div className="mt-1">
                        <FefoPickNote picks={item.fefoPicks ?? []} quantity={item.quantity} batchTracked={item.batchTracked} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemove(item.medicineId)}
                      aria-label={`Remove ${item.medicineName} from cart`}
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Label htmlFor={`qty-${item.medicineId}`} className="sr-only">
                        Quantity for {item.medicineName}
                      </Label>
                      <Input
                        id={`qty-${item.medicineId}`}
                        type="number"
                        min={1}
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => onUpdateQty(item.medicineId, Number.parseInt(e.target.value, 10) || 1)}
                        className="h-8 w-14 text-center text-xs tabular-nums"
                        aria-label={`Quantity for ${item.medicineName}`}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={item.discountPercent === 0 ? "" : item.discountPercent}
                        onChange={(e) =>
                          onUpdateDiscount(
                            item.medicineId,
                            Math.max(0, Math.min(100, Number.parseFloat(e.target.value) || 0))
                          )
                        }
                        className="h-8 w-14 text-center text-xs tabular-nums"
                        placeholder="0"
                        aria-label={`Discount percent for ${item.medicineName}`}
                      />
                      <span className="text-xs text-muted-foreground">% off</span>
                    </div>
                    <span className="ml-auto text-sm font-semibold tabular-nums">
                      <CurrencyDisplay amount={item.totalPrice} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t pt-3">
              <div>
                <Label className="text-xs font-medium">Order discount %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPercent === 0 ? "" : discountPercent}
                  onChange={(e) => setDiscountPercent(Number.parseFloat(e.target.value) || 0)}
                  className="h-10 mt-1 text-sm"
                  placeholder="0"
                  aria-label="Order discount percentage"
                />
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium"><CurrencyDisplay amount={subtotal} /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (incl., {(taxRate * 100).toFixed(0)}%)</span>
                <span className="font-medium"><CurrencyDisplay amount={taxAmount} /></span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>Discount</span>
                  <span className="font-medium">-<CurrencyDisplay amount={discountAmount} /></span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between items-baseline">
                <span className="text-base font-semibold">Total</span>
                <span className="text-xl font-bold text-primary">
                  <CurrencyDisplay amount={total} />
                </span>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full h-12 text-base font-semibold"
              onClick={onSubmit}
              disabled={loading || cart.length === 0}
              title={cart.length === 0 ? "Add items to cart" : undefined}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Processing...
                </>
              ) : (
                <>
                  <Receipt className="mr-2 h-4 w-4" aria-hidden />
                  Review and pay <CurrencyDisplay amount={total} />
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

