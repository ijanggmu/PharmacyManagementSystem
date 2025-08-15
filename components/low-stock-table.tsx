"use client"

import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"

interface InventoryData {
  name: string
  stock_quantity: number
  minimum_stock: number
  unit_price: string
}

interface LowStockTableProps {
  data: InventoryData[]
}

export default function LowStockTable({ data }: LowStockTableProps) {
  const lowStockItems = data
    .filter((item) => item.stock_quantity <= item.minimum_stock)
    .sort((a, b) => a.stock_quantity - b.stock_quantity)
    .slice(0, 10)

  if (lowStockItems.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-sm">All items are well stocked!</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {lowStockItems.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <div>
              <div className="font-medium text-sm">{item.name}</div>
              <div className="text-xs text-gray-600">Min: {item.minimum_stock} units</div>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="destructive" className="mb-1">
              {item.stock_quantity} left
            </Badge>
            <div className="text-xs text-gray-600">${Number.parseFloat(item.unit_price).toFixed(2)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
