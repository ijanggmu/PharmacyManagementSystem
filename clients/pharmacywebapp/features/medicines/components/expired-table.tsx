"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CalendarX, PackageCheck } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"
import { EmptyState } from "@/components/ui/empty-state"

interface InventoryRow {
  id: string
  name: string
  generic_name?: string
  brand_name?: string
  stock_quantity: number
  minimum_stock: number
  unit_price: string
  /** Stock is valued at cost — what the expired units cost the pharmacy. Falls back to unit_price when absent. */
  cost_price?: string
  expiry_date?: string
  categories?: {
    name: string
  }
  suppliers?: {
    name: string
  }
}

interface ExpiredTableProps {
  data: InventoryRow[]
}

export default function ExpiredTable({ data }: ExpiredTableProps) {
  const currentDate = new Date()

  const expiredItems = (data || [])
    .filter((item) => {
      if (!item.expiry_date) return false
      const expiryDate = new Date(item.expiry_date)
      return expiryDate < currentDate
    })
    .sort((a, b) => {
      const dateA = new Date(a.expiry_date!)
      const dateB = new Date(b.expiry_date!)
      return dateA.getTime() - dateB.getTime()
    })

  if (expiredItems.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={PackageCheck}
        title="No expired medicines"
        description="Medicines past their expiry date will be listed here so you can write them off."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Medicine</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead>Expiry date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Value at cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expiredItems.map((item) => {
            const expiryDate = new Date(item.expiry_date!)
            const daysExpired = Math.floor((currentDate.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24))
            const unitValue = item.cost_price ?? item.unit_price
            const stockValue = item.stock_quantity * (Number.parseFloat(unitValue) || 0)

            return (
              <TableRow key={item.id} className="bg-destructive/[0.03]">
                <TableCell>
                  <div className="max-w-[240px]">
                    <div className="truncate font-medium" title={item.name}>
                      {item.name}
                    </div>
                    {item.generic_name && (
                      <div className="truncate text-sm text-muted-foreground">{item.generic_name}</div>
                    )}
                    {item.brand_name && (
                      <div className="truncate text-sm text-muted-foreground">Brand: {item.brand_name}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{item.categories?.name || "Uncategorized"}</div>
                </TableCell>
                <TableCell className="num text-right font-medium">{item.stock_quantity}</TableCell>
                <TableCell>
                  <div className="num font-medium text-destructive">{expiryDate.toLocaleDateString()}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="num">{daysExpired}</span> day{daysExpired !== 1 ? "s" : ""} ago
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="danger">
                    <CalendarX aria-hidden />
                    Expired
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="num font-medium">
                    <CurrencyDisplay amount={stockValue.toFixed(2)} />
                  </div>
                  <div className="num text-sm text-muted-foreground">
                    {item.stock_quantity} × <CurrencyDisplay amount={unitValue} />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
