"use client"

import { CartItem } from "./types"

interface CartSummaryProps {
  items: CartItem[]
  onRemoveItem: (medicineId: string) => void
  onUpdateQuantity: (medicineId: string, quantity: number) => void
  subtotal: number
  tax: number
  total: number
}

export function CartSummary({
  items,
  onRemoveItem,
  onUpdateQuantity,
  subtotal,
  tax,
  total,
}: CartSummaryProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Cart</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Cart is empty</p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.medicineId} className="p-3 border rounded flex justify-between">
                <div>
                  <p className="font-medium">{item.medicineName}</p>
                  <p className="text-sm text-muted-foreground">
                    Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={item.availableStock}
                    value={item.quantity}
                    onChange={(e) => onUpdateQuantity(item.medicineId, parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border rounded"
                  />
                  <button
                    onClick={() => onRemoveItem(item.medicineId)}
                    className="px-2 py-1 text-destructive"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 pt-4 border-t">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax:</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

