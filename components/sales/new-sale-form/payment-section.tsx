"use client"

interface PaymentSectionProps {
  paymentMethod: 'cash' | 'card' | 'insurance' | 'other'
  onPaymentMethodChange: (method: 'cash' | 'card' | 'insurance' | 'other') => void
  notes: string
  onNotesChange: (notes: string) => void
  total: number
}

export function PaymentSection({
  paymentMethod,
  onPaymentMethodChange,
  notes,
  onNotesChange,
  total,
}: PaymentSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Payment</h3>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => onPaymentMethodChange(e.target.value as 'cash' | 'card' | 'insurance' | 'other')}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="insurance">Insurance</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="w-full px-3 py-2 border rounded"
          rows={3}
        />
      </div>
      <div className="pt-4 border-t">
        <div className="flex justify-between font-bold text-lg">
          <span>Total:</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

