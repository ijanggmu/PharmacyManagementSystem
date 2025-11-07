"use client"

import { Medicine } from "./types"

interface MedicineSelectorProps {
  medicines: Medicine[]
  onAddToCart: (medicine: Medicine, quantity: number) => void
}

export function MedicineSelector({ medicines, onAddToCart }: MedicineSelectorProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Select Medicines</h3>
      <div className="grid grid-cols-1 gap-2">
        {medicines.map((medicine) => (
          <div key={medicine.id} className="p-3 border rounded">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{medicine.name}</p>
                <p className="text-sm text-muted-foreground">
                  {medicine.strength} • {medicine.form}
                </p>
                <p className="text-sm">Stock: {medicine.stock_quantity}</p>
              </div>
              <button
                onClick={() => onAddToCart(medicine, 1)}
                className="px-3 py-1 bg-primary text-primary-foreground rounded"
                disabled={medicine.stock_quantity === 0}
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

