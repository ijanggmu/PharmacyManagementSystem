import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CurrencyDisplay } from "@/components/currency-display"
import { EmptyState } from "@/components/ui/empty-state"
import { AlertTriangle, PackageCheck, PackageMinus } from "lucide-react"
import { sellableStock } from "@/features/medicines/api-client"

interface InventoryRow {
  name: string
  stock_quantity: number
  /** Sellable units (expired/recalled excluded); low stock is judged on this when present. */
  sellable_stock_quantity?: number
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
    .filter((item) => sellableStock(item) <= item.minimum_stock)
    .sort((a, b) => sellableStock(a) - sellableStock(b))

  if (lowStockItems.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={PackageCheck}
        title="Stock levels look healthy"
        description="Every medicine is above its reorder level. Medicines at or below it will be listed here."
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
            <TableHead className="text-right">Reorder level</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lowStockItems.map((item, idx) => {
            const value = (item.stock_quantity || 0) * (parseFloat(item.unit_price) || 0)
            const isOut = sellableStock(item) === 0
            const status = isOut
              ? { label: "Out of stock", variant: "danger" as const, Icon: AlertTriangle }
              : { label: "Low stock", variant: "warning" as const, Icon: PackageMinus }

            return (
              <TableRow key={`${item.name}-${idx}`}>
                <TableCell className="max-w-[220px] truncate font-medium" title={item.name}>
                  {item.name}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{item.categories?.name || "Uncategorized"}</Badge>
                </TableCell>
                <TableCell className="num text-right">{item.stock_quantity}</TableCell>
                <TableCell className="num text-right">{item.minimum_stock}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>
                    <status.Icon aria-hidden />
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="num text-right">
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
