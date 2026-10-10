"use client"

import { Badge } from "@/components/ui/badge"
import { CurrencyDisplay } from "@/components/currency-display"
import { EmptyState } from "@/components/ui/empty-state"
import { Package } from "lucide-react"

interface SaleItem {
  quantity: number
  total_price: string
  medicines: {
    name: string
    strength: string
    form: string
  } | null
}

interface TopProductsProps {
  data: SaleItem[]
}

export default function TopProducts({ data }: TopProductsProps) {
  // Group by medicine and calculate totals
  const productStats = data.reduce(
    (acc: { [key: string]: { quantity: number; revenue: number; name: string } }, item) => {
      if (!item.medicines) return acc

      const key = item.medicines.name
      if (!acc[key]) {
        acc[key] = {
          quantity: 0,
          revenue: 0,
          name: `${item.medicines.name} ${item.medicines.strength} ${item.medicines.form}`,
        }
      }
      acc[key].quantity += item.quantity
      acc[key].revenue += Number.parseFloat(item.total_price)
      return acc
    },
    {},
  )

  // Sort by quantity sold and take top 10
  const topProducts = Object.values(productStats)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  if (topProducts.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={Package}
        title="No products sold in this period"
        description="Best sellers appear here once sales are recorded in the selected date range."
      />
    )
  }

  return (
    <div className="space-y-4">
      {topProducts.map((product, index) => (
        <div key={product.name} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex min-w-0 items-center gap-3">
            <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
              {index + 1}
            </Badge>
            <div className="min-w-0">
              <div className="truncate font-medium text-sm" title={product.name}>{product.name}</div>
              <div className="num text-xs text-muted-foreground">{product.quantity} units sold</div>
            </div>
          </div>
          <div className="text-right">
            <div className="num font-medium"><CurrencyDisplay amount={product.revenue.toFixed(2)}/></div>
            <div className="text-xs text-muted-foreground">Revenue</div>
          </div>
        </div>
      ))}
    </div>
  )
}
