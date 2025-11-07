"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Calendar } from "lucide-react"
import { CurrencyDisplay } from "@/components/currency-display"

interface InventoryRow {
  id: string
  name: string
  generic_name?: string
  brand_name?: string
  stock_quantity: number
  minimum_stock: number
  unit_price: string
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
      <div className="text-sm text-gray-500">No expired medicines found.</div>
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
            <TableHead>Expiry Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expiredItems.map((item) => {
            const expiryDate = new Date(item.expiry_date!)
            const daysExpired = Math.floor((currentDate.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24))
            const stockValue = item.stock_quantity * Number.parseFloat(item.unit_price)

            return (
              <TableRow key={item.id} className="bg-red-50">
                <TableCell>
                  <div>
                    <div className="font-medium">{item.name}</div>
                    {item.generic_name && (
                      <div className="text-sm text-gray-500">{item.generic_name}</div>
                    )}
                    {item.brand_name && (
                      <div className="text-sm text-gray-500">Brand: {item.brand_name}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{item.categories?.name || "Uncategorized"}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{item.stock_quantity}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-red-500" />
                    <div>
                      <div className="font-medium text-red-600">
                        {expiryDate.toLocaleDateString()}
                      </div>
                      <div className="text-sm text-red-500">
                        {daysExpired} day{daysExpired !== 1 ? 's' : ''} expired
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Expired
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="font-medium">
                    <CurrencyDisplay amount={stockValue.toFixed(2)} />
                  </div>
                  <div className="text-sm text-gray-500">
                    {item.stock_quantity} × <CurrencyDisplay amount={item.unit_price} />
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
