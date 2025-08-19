import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CurrencyDisplay } from "@/components/currency-display"

interface InventoryRow {
  name: string
  stock_quantity: number
  minimum_stock: number
  unit_price: string
  categories?: { name: string } | null
}

interface LowStockTableProps {
  data: InventoryRow[]
}

export default function LowStockTable({ data }: LowStockTableProps) {
  const lowStockItems = (data || [])
    .filter((item) => typeof item.stock_quantity === "number" && typeof item.minimum_stock === "number")
    .filter((item) => item.stock_quantity <= item.minimum_stock)
    .sort((a, b) => a.stock_quantity - b.stock_quantity)

  if (lowStockItems.length === 0) {
    return (
      <div className="text-sm text-gray-500">All inventory items are above minimum stock.</div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Medicine</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Minimum</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lowStockItems.map((item, idx) => {
            const value = (item.stock_quantity || 0) * (parseFloat(item.unit_price) || 0)
            const isOut = item.stock_quantity === 0
            const status = isOut
              ? { label: "Out of Stock", variant: "destructive" as const }
              : { label: "Low Stock", variant: "secondary" as const }

            return (
              <TableRow key={`${item.name}-${idx}`}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.categories?.name || "Uncategorized"}</Badge>
                </TableCell>
                <TableCell>{item.stock_quantity}</TableCell>
                <TableCell>{item.minimum_stock}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay amount={value} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}


