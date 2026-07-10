"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CurrencyDisplay } from "@/components/currency-display"
import { Loader2, Receipt, Search, ShoppingCart, Trash2, X } from "lucide-react"
import { CartItem } from "@/features/sales/types"

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
  paymentMethod: string
  setPaymentMethod: (m: string) => void
  loading: boolean
  onRemove: (id: string) => void
  onUpdateQty: (id: string, qty: number) => void
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
  paymentMethod,
  setPaymentMethod,
  loading,
  onRemove,
  onUpdateQty,
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
            <div className="overflow-auto border rounded-md max-h-[220px] min-h-0">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-muted/95 backdrop-blur">
                    <TableHead className="w-9 text-xs">#</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-center text-xs w-20">Qty</TableHead>
                    <TableHead className="text-right text-xs">Unit</TableHead>
                    <TableHead className="text-right text-xs">Total</TableHead>
                    <TableHead className="w-11" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCartItems.map((item, index) => (
                    <TableRow key={item.medicineId} className="hover:bg-muted/50">
                      <TableCell className="text-muted-foreground text-sm py-2">{index + 1}</TableCell>
                      <TableCell className="py-2">
                        <div>
                          <div className="font-medium text-sm">{item.medicineName}</div>
                          <div className="text-xs text-muted-foreground">{item.strength} - {item.form}</div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number"
                          min={1}
                          max={item.availableStock}
                          value={item.quantity}
                          onChange={(e) => onUpdateQty(item.medicineId, Number.parseInt(e.target.value, 10) || 1)}
                          className="h-9 w-16 text-center text-sm"
                          aria-label={`Quantity for ${item.medicineName}`}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm py-2">
                        <CurrencyDisplay amount={item.unitPrice} />
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm py-2">
                        <CurrencyDisplay amount={item.totalPrice} />
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive hover:bg-destructive/10"
                          onClick={() => onRemove(item.medicineId)}
                          aria-label={`Remove ${item.medicineName} from cart`}
                          title="Remove"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium">Payment</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-10 mt-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="fonepay">Fonepay</SelectItem>
                      <SelectItem value="esewa">eSewa</SelectItem>
                      <SelectItem value="khalti">Khalti</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="credit">Credit (AR)</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium">Discount %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={discountPercent === 0 ? "" : discountPercent}
                    onChange={(e) => setDiscountPercent(Number.parseFloat(e.target.value) || 0)}
                    className="h-10 mt-1 text-sm"
                    placeholder="0"
                    aria-label="Discount percentage"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium"><CurrencyDisplay amount={subtotal} /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(0)}%)</span>
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

