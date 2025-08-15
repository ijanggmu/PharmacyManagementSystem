"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Eye, Receipt, RefreshCw } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface Sale {
  id: string
  sale_number: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payment_method: string
  payment_status: string
  sale_date: string
  customers: {
    first_name: string
    last_name: string
    phone: string | null
  } | null
  sale_items: {
    id: string
    quantity: number
    unit_price: string
    total_price: string
    medicines: {
      name: string
      strength: string
      form: string
    } | null
  }[]
}

interface SalesTableProps {
  sales: Sale[]
}

export default function SalesTable({ sales }: SalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredSales = sales.filter(
    (sale) =>
      sale.sale_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customers?.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customers?.last_name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const getPaymentMethodBadge = (method: string) => {
    switch (method) {
      case "cash":
        return { label: "Cash", variant: "default" as const }
      case "card":
        return { label: "Card", variant: "secondary" as const }
      case "insurance":
        return { label: "Insurance", variant: "outline" as const }
      case "mixed":
        return { label: "Mixed", variant: "secondary" as const }
      default:
        return { label: method, variant: "secondary" as const }
    }
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return { label: "Paid", variant: "default" as const }
      case "pending":
        return { label: "Pending", variant: "secondary" as const }
      case "refunded":
        return { label: "Refunded", variant: "destructive" as const }
      default:
        return { label: status, variant: "secondary" as const }
    }
  }

  const getTotalItems = (items: Sale["sale_items"]) => {
    return items.reduce((sum, item) => sum + item.quantity, 0)
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sale #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredSales.map((sale) => {
            const paymentMethodBadge = getPaymentMethodBadge(sale.payment_method)
            const paymentStatusBadge = getPaymentStatusBadge(sale.payment_status)
            const totalItems = getTotalItems(sale.sale_items)

            return (
              <TableRow key={sale.id}>
                <TableCell>
                  <div className="font-medium">{sale.sale_number}</div>
                </TableCell>
                <TableCell>
                  <div>
                    {sale.customers ? (
                      <>
                        <div className="font-medium">
                          {sale.customers.first_name} {sale.customers.last_name}
                        </div>
                        {sale.customers.phone && <div className="text-sm text-gray-500">{sale.customers.phone}</div>}
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">Walk-in Customer</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{totalItems} items</div>
                    <div className="text-sm text-gray-500">{sale.sale_items.length} products</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">${Number.parseFloat(sale.total_amount).toFixed(2)}</div>
                    {Number.parseFloat(sale.discount_amount) > 0 && (
                      <div className="text-sm text-green-600">
                        -${Number.parseFloat(sale.discount_amount).toFixed(2)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={paymentMethodBadge.variant}>{paymentMethodBadge.label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={paymentStatusBadge.variant}>{paymentStatusBadge.label}</Badge>
                </TableCell>
                <TableCell>{new Date(sale.sale_date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Receipt className="h-4 w-4 mr-2" />
                        Print Receipt
                      </DropdownMenuItem>
                      {sale.payment_status === "paid" && (
                        <DropdownMenuItem className="text-red-600">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Process Refund
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
